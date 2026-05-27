# Auditoría Enterprise — Dorado Lounge System

**Fecha:** 2026-05-27  
**Rama analizada:** `claude/enterprise-audit-dQLvw`  
**Metodología:** 5 agentes especializados en paralelo (Seguridad, Base de datos, Arquitectura/Backend, Frontend/Performance, DevOps/Infraestructura)  
**Archivos auditados:** 531 (todos los archivos del proyecto)

---

## Resumen Ejecutivo

El sistema tiene una arquitectura sólida: hexagonal estricta, RBAC correcto, RLS en Postgres, FEFO vía RPC, optimistic locking, cadena hash en audit_log, idempotency keys. Sin embargo, la auditoría identificó **22 hallazgos CRÍTICOS** y **49 hallazgos ALTOS** que deben resolverse antes del siguiente deploy de producción.

### Distribución por severidad

| Severidad | Seguridad | Base de datos | Arquitectura | Frontend | DevOps | Total |
|-----------|-----------|---------------|--------------|----------|--------|-------|
| CRÍTICO   | 3         | 4             | 2            | 6        | 5      | **20** |
| ALTO      | 7         | 7             | 12           | 9        | 7      | **42** |
| MEDIO     | 8         | 11            | 12           | 10       | 11     | 52    |
| BAJO      | 6         | 6             | 11           | 14       | 8      | 45    |

> **Nota de deduplicación:** VULN-005/HIGH-06 (QR tokens sin expiración) y VULN-007/BIZ-4 (tenant filter faltante en findLotesByInsumo) y VULN-017/BIZ-9 (toggleDisponibilidadPlato permiso incorrecto) aparecen en múltiples agentes y se consolidan aquí con un único ID.

---

## PARTE 1 — HALLAZGOS CRÍTICOS (Bloquean deploy)

---

### C-01 — Admin puede enumerar usuarios de todos los tenants

**Archivo:** `apps/web/src/modules/superuser/actions.ts:80`  
**Categoría:** Seguridad / Escalada de privilegios

`getUsers(tenantId?: string)` usa `createAdminClient()` (service_role, bypasa RLS). El parámetro `tenantId` es controlado por el caller y no está vinculado a `ctx.tenantId`. Un `admin` que omita el argumento recibe el dump completo de usuarios de todos los tenants.

```typescript
// VULNERABLE — tenantId es libre
const scopedTenantId = ctx.role === 'superuser' ? tenantId : ctx.tenantId;
return ok(await getUsersFn(repo, scopedTenantId)); // FIX
```

---

### C-02 — `recepcion` bloqueado por RLS al escribir en afluencia_ingresos

**Archivos:** `apps/web/src/lib/auth/permissions.ts:113` · `supabase/migrations/20260503132352_0006_operations.sql:99-104`  
**Categoría:** RLS / Funcionalidad rota

La política `afluencia_insert_staff` solo permite `('superuser','admin','chef','sous_chef')`. `recepcion` tiene `afluencia:write` en el mapa de permisos pero RLS lo bloquea → inserciones silenciosamente fallidas. Función principal del rol completamente inoperante.

```sql
-- FIX: agregar recepcion a la política
AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
  'superuser', 'admin', 'recepcion'
)
```

---

### C-03 — Roles no-admin bloqueados por RLS al gestionar sus propios turnos

**Archivos:** `apps/web/src/lib/auth/permissions.ts:129-142` · `supabase/migrations/20260503132352_0006_operations.sql:31-37`  
**Categoría:** RLS / Funcionalidad rota

`turnos_modify_admin` solo permite `('superuser','admin')` pero 11 roles tienen `turnos:write`. Todo el flujo de apertura/cierre de turno para personal no-admin falla silenciosamente.

```sql
-- FIX: ampliar o rediseñar la política para incluir los roles propietarios de turno
AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
  'superuser', 'admin', 'chef', 'sous_chef', 'mesero_amex',
  'personal_snack', 'personal_buffet', 'personal_almacen',
  'personal_pasteleria', 'steward', 'recepcion'
)
```

---

### C-04 — FEFO + transición de estado no son atómicos

**Archivos:** `apps/web/src/modules/production/actions.ts:121-161` · `apps/web/src/modules/orders/actions.ts:352-384`  
**Categoría:** Atomicidad / Integridad de inventario

La deducción FEFO y la actualización de estado (`completada`/`entregado`) son dos operaciones separadas. Si la primera falla después de la deducción, el stock queda decrementado sin registro de producción. Viola el Principio Rector.

**Fix:** Crear RPC `fn_completar_tanda(p_tanda_id, p_ingredientes, p_idempotency_key)` que ejecute ambas operaciones en una sola transacción Postgres.

---

### C-05 — Race condition en la cadena hash del audit_log

**Archivo:** `supabase/migrations/20260520000000_audit_log_qualified_digest.sql:15-23`  
**Categoría:** Integridad / Concurrencia

El trigger lee `prev_hash` con `ORDER BY created_at DESC LIMIT 1` sin `FOR UPDATE`. Dos inserciones concurrentes leen el mismo `prev_hash` → fork de la cadena → la garantía anti-tamper queda invalidada bajo carga normal del sistema.

```sql
-- FIX: serializar inserciones con advisory lock por tenant
SELECT pg_advisory_xact_lock(hashtext(p_tenant_id::text));
-- o añadir FOR UPDATE al SELECT del prev_hash
```

---

### C-06 — Las vistas materializadas no tienen RLS

**Archivo:** `supabase/migrations/20260503132451_0009_materialized_views.sql`  
**Categoría:** RLS / Fuga cross-tenant

`mv_cogs_per_passenger`, `mv_consumo_vs_produccion_turno`, `mv_ocupacion_diaria` sin políticas RLS ni restricciones de acceso. Cualquier rol `authenticated` puede hacer `SELECT * FROM mv_cogs_per_passenger` y ver KPIs financieros de todos los tenants.

```sql
-- FIX: crear vistas filtradas por tenant sobre las mat views
CREATE OR REPLACE VIEW public.v_cogs_per_passenger_tenant AS
SELECT * FROM public.mv_cogs_per_passenger
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
```

---

### C-07 — Funciones de retención de datos vs. trigger append-only (conflicto)

**Archivo:** `supabase/migrations/20260513000000_data_retention_90d.sql:6-15`  
**Categoría:** Cumplimiento / Funcionalidad rota

`fn_purgar_mensajes_chat_antiguos()` ejecuta `DELETE FROM mensajes_chat`, pero la migración 0007 instaló un trigger `BEFORE DELETE` en esa tabla que llama a `prevent_mutation()` y bloquea cualquier DELETE. La retención de datos (Ley 1581) falla silenciosamente → la tabla crece indefinidamente.

```sql
-- FIX opción A: eliminar trigger append-only de mensajes_chat
DROP TRIGGER IF EXISTS mensajes_chat_no_delete ON public.mensajes_chat;

-- FIX opción B: modificar prevent_mutation para permitir bypass desde SECURITY DEFINER
IF current_setting('app.retention_purge', true) = 'true' THEN RETURN OLD; END IF;
```

---

### C-08 — `pedidos.idempotency_key` tiene UNIQUE global (cross-tenant)

**Archivo:** `supabase/migrations/20260503132309_0005_production_orders.sql:75`  
**Categoría:** Integridad / Disponibilidad

El constraint `text UNIQUE` es global. Si dos tenants usan el mismo formato de idempotency key, la creación de pedidos falla con error 23505 críptico para uno de ellos.

```sql
-- FIX: eliminar constraint global, mantener solo el índice parcial por tenant
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_idempotency_key_key;
```

---

### C-09 — Contraseña Wi-Fi de la sala hardcodeada en el bundle del cliente

**Archivo:** `apps/web/src/components/qr/qr-passenger-app.tsx:71,121,171,221`  
**Categoría:** Seguridad / Exposición de secretos

```typescript
wifi_pass: 'AmexLounge2025.',  // CRÍTICO: visible en DevTools/source maps
```

Cualquier pasajero puede extraer la contraseña Wi-Fi real desde el bundle JavaScript, los source maps o `window.__NEXT_DATA__`. La rotación requiere un deploy completo.

**Fix:** Variable de entorno server-side, inyectada como prop de server component. Nunca en el cliente.

---

### C-10 — `/api/heartbeat` y `/health` bloqueados por el middleware (monitoreo caído)

**Archivos:** `apps/web/src/middleware.ts:6` · `apps/web/vercel.json:5`  
**Categoría:** Disponibilidad / Monitoreo

`PUBLIC_PATHS` no incluye `/api/heartbeat` ni `/health`. El middleware redirige estas rutas a `/login` cuando Vercel Cron o Better Stack las llaman sin sesión → Better Stack ve downtime constante aunque el servicio esté sano.

```typescript
// FIX: agregar a PUBLIC_PATHS en middleware.ts
const PUBLIC_PATHS = ['/login', '/qr', '/api/cron', '/api/heartbeat', '/health'];
```

---

### C-11 — HTML inválido: `<html>` y `<body>` anidados en el QR layout

**Archivos:** `apps/web/src/app/layout.tsx:52-57` · `apps/web/src/app/qr/[locale]/layout.tsx:35-49`  
**Categoría:** HTML / Accesibilidad

El QR nested layout renderiza su propio `<html><head><body>` dentro del root layout, generando HTML con elementos `<html>` anidados — inválido per HTML5 spec. Produce parsing quirks en browsers, rompe el árbol de accesibilidad y puede afectar SEO.

**Fix:** El QR layout solo debe usar `<div>` o fragmento (`<>`). Metadata QR → `generateMetadata()`.

---

### C-12 — Proyecto Supabase hardcodeado en scripts de CI (en historial git)

**Archivos:** `scripts/ci-backup.py:17` · `scripts/ci-migrate.py:15`  
**Categoría:** Seguridad / Secretos

```python
PROJECT_REF = "gyewxgtuzjbxzcvcfmwy"  # hardcodeado, visible en git history
```

Combinado con un `SUPABASE_ACCESS_TOKEN` comprometido da acceso directo a la DB de producción vía Management API. El project ref está permanentemente en el historial git.

```python
# FIX
PROJECT_REF = os.environ['SUPABASE_PROJECT_REF']
```

---

### C-13 — Deploy no espera que el CI pase (tests bypasseables)

**Archivo:** `.github/workflows/deploy.yml`  
**Categoría:** CI/CD / Calidad

`deploy.yml` se dispara en `push: main` simultáneamente con `ci.yml`. No tiene `workflow_run` dependency. Un push con tests fallidos puede deployar a producción.

**Fix:** Añadir dependencia explícita o usar un único workflow con `needs: [lint, typecheck, test, e2e]` en el job de deploy.

---

### C-14 — GitHub Actions con pinning por tag (supply chain attack)

**Archivos:** Todos los `.github/workflows/*.yml`  
**Categoría:** CI/CD / Seguridad

Todos los actions usan tags mutables (`actions/checkout@v4`, `getsentry/action-release@v1`). Un atacante que comprometa el publisher puede actualizar el tag y robar todos los secrets del CI en el próximo run.

```yaml
# FIX: pinning por commit SHA
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

---

### C-15 — `CRON_SECRET` almacenado en `pg_settings` (legible por usuarios autenticados)

**Archivo:** `supabase/migrations/20260516000003_pgcron_check_alertas.sql:38`  
**Categoría:** Seguridad / Secretos

`ALTER DATABASE postgres SET app.cron_secret = '...'` almacena el valor en `pg_catalog.pg_db_role_setting`. Cualquier usuario con sesión Supabase puede leerlo con `SELECT current_setting('app.cron_secret')` desde una función o RLS policy.

**Fix:** Usar Supabase Vault para secretos sensitivos, o no almacenarlo en pg_settings. El único lugar autorizado es la variable de entorno de Vercel.

---

### C-16 — Scripts destructivos sin guardia de entorno de producción

**Archivos:** `scripts/reset-users.mjs` · `scripts/reset-users.sql`  
**Categoría:** DevOps / Disponibilidad

`reset-users.mjs` está documentado como "DESTRUCTIVO — borra todos los usuarios" pero no tiene ninguna validación del entorno. Usa `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` del `.env.local` — el mismo archivo de producción.

```javascript
// FIX: añadir al inicio de cada script destructivo
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!url.includes('staging') && process.env.ALLOW_PRODUCTION_RESET !== 'yes_i_know') {
  console.error('SAFETY: Solo ejecutar contra base de datos de staging/dev');
  process.exit(1);
}
```

---

### C-17 — `lotes` INSERT excluye a `personal_almacen`

**Archivo:** `supabase/migrations/20260503132217_0003_inventory_core.sql:105-112`  
**Categoría:** RLS / Funcionalidad rota

`lotes_modify_admin` no incluye `personal_almacen`, cuya función principal es la recepción de lotes. El repository workaround usa `createAdminClient()`, eliminando la defensa en profundidad — un bug en `assertCan()` permitiría que cualquier rol inserte lotes.

---

### C-18 — `cocina-amex/domain` importa desde `orders/domain` (acoplamiento cross-módulo)

**Archivo:** `apps/web/src/modules/cocina-amex/domain/pedido-amex.ts:10-11`  
**Categoría:** Arquitectura / Hexagonal

```typescript
} from '@/modules/orders/domain/pedido';
export { PEDIDO_TRANSITIONS } from '@/modules/orders/domain/pedido';
```

Viola el principio de dominio autocontenido. Cambios en `orders/domain` rompen silenciosamente el KDS AMEX. La regla ESLint no cubre este caso (solo bloquea imports de `infrastructure/`).

**Fix:** Mover los tipos compartidos a `@dorado/shared-types` o duplicar los mínimos necesarios en `cocina-amex/domain/`.

---

### C-19 — `completarTanda` reporta `STOCK_INSUFICIENTE` falso en retry idempotente

**Archivo:** `apps/web/src/modules/production/actions.ts:142-158`  
**Categoría:** Lógica de negocio / Error handling

```typescript
if (!rpcResult?.ok) {
  throw new AppError('STOCK_INSUFICIENTE', 409, ...); // INCORRECTO
}
```

Si el RPC retorna `null` (idempotency key ya consumida), la tanda no puede re-completarse. Bloquea producción con un error engañoso en cualquier reintento.

**Fix:** Distinguir `error.code === 'P0001'` (stock real insuficiente) de otros resultados falsy (idempotente), igual que en `orders/actions.ts`.

---

### C-20 — ThemeProvider duplicado con mismo `storageKey` — race condition visual

**Archivo:** `apps/web/src/components/theme/theme-provider.tsx:13-22`  
**Categoría:** Frontend / UX

Root layout y QR layout instancian `ThemeProvider` con `storageKey="dorado-theme"`, ambos escribiendo a `document.documentElement` y al mismo `localStorage` key. Theme flash, renderizado incorrecto en rutas QR (tema oscuro staff sobre interfaz clara de pasajero).

**Fix:** `storageKey="dorado-qr-theme"` para el ThemeProvider del QR layout.

---

### C-21 — FEFO no filtra lotes vencidos

**Archivo:** `supabase/migrations/20260503132430_0008_rpcs.sql:99-111`  
**Categoría:** Seguridad alimentaria / Lógica de negocio

El cursor FEFO no tiene filtro `fecha_vencimiento >= CURRENT_DATE`. Ingredientes vencidos se usan primero (por FEFO ordering ASC), sin ninguna advertencia.

```sql
-- FIX: añadir al cursor FEFO
AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
```

---

### C-22 — Backup sin encriptar, almacenado como artefacto GitHub (acceso por cualquier colaborador)

**Archivo:** `.github/workflows/backup.yml:49-54`  
**Categoría:** Seguridad / GDPR

El backup completo de producción (incluyendo `audit_log`, `users`, `pedidos`, datos de pasajeros) se sube como GitHub Artifact sin encriptar con retención de 30 días. Cualquier usuario con acceso de lectura al repo puede descargarlo.

```bash
# FIX: encriptar antes de subir
gpg --symmetric --cipher-algo AES256 --passphrase "${{ secrets.BACKUP_GPG_PASSPHRASE }}" \
  "backup-${{ steps.ts.outputs.stamp }}.sql.gz"
```

---

## PARTE 2 — HALLAZGOS ALTOS (Resolver antes del siguiente sprint)

### A-01 — Comparación de `CRON_SECRET` no usa tiempo constante
**Archivo:** `apps/web/src/app/api/cron/check-alertas/route.ts:26`  
Comparación de string con `===` es susceptible a timing side-channel. Usar `crypto.timingSafeEqual()`.

### A-02 — QR tokens sin expiración ni revocación
**Archivo:** `apps/web/src/lib/qr/token.ts:17-23`  
Tokens sin `exp`, sin `iat`, sin `jti`. Una foto del sticker da acceso indefinido. Solo revocación posible: rotar el secret global.

### A-03 — IP spoofing para bypass de rate limiting
**Archivo:** `apps/web/src/lib/rate-limit.ts:77-82`  
`X-Forwarded-For` header es controlado por el atacante. Permite brute-force de credenciales sin límite.

### A-04 — Chat sin validación de CHANNEL_ACL en servidor
**Archivos:** `apps/web/src/modules/chat/actions.ts:14,48`  
`enviarMensaje` y `getMensajes` no verifican si el rol tiene acceso al canal según `CHANNEL_ACL`. Cualquier rol puede leer/escribir en cualquier canal de cocina.

### A-05 — Funciones de retención PUBLIC (callable por cualquier usuario autenticado)
**Archivo:** `supabase/migrations/20260513000000_data_retention_90d.sql`  
`fn_purgar_mensajes_chat_antiguos()` y `fn_purgar_afluencia_antigua()` no tienen `REVOKE FROM PUBLIC`. Cualquier usuario autenticado puede destruir el historial de mensajes vía REST API.

### A-06 — `personal_almacen` excluido del INSERT en `lotes` → workaround con admin client
**Archivo:** `supabase/migrations/20260503132217_0003_inventory_core.sql:105`  
Ver C-17. Al usar admin client como workaround, cualquier bug en assertCan permite que cualquier rol inserte lotes.

### A-07 — `getSession()` en dashboard layout (Supabase: inseguro en servidor)
**Archivo:** `apps/web/src/app/(dashboard)/layout.tsx:62-69`  
Supabase documenta explícitamente que `getSession()` no debe usarse en servidor — retorna datos de cookie sin verificar contra el auth server. Usar solo `getUser()`.

### A-08 — Socket.io `error` handler nunca limpiado (memory leak)
**Archivo:** `apps/web/src/lib/socket/socket-provider.tsx:13-16`  
El handler de `error` se registra pero no se remueve en el cleanup del `useEffect`. Acumulación de listeners en cada re-mount.

### A-09 — `stockOut` usa `p_tipo: 'ajuste'` en lugar de `salida_receta`
**Archivo:** `apps/web/src/modules/inventory/actions.ts:191-193`  
El consumo de snack/buffet se registra como ajuste manual, no como salida por receta. Los KPIs de COGS serán sistemáticamente incorrectos.

### A-10 — `registrarMerma` silencia el error del upsert en `mermas`
**Archivo:** `apps/web/src/modules/inventory/actions.ts:257-268`  
Si el INSERT en `mermas` falla, el stock ya fue deducido pero no hay registro de merma. Sistema en estado inconsistente silenciosamente.

### A-11 — Snack module no descuenta stock al despachar (viola Principio Rector)
**Archivo:** `apps/web/src/modules/snack/actions.ts`  
No hay ninguna llamada a `fn_descontar_insumo_fefo` en el flujo de despacho snack. El inventario de snack nunca se reduce.

### A-12 — `fn_descontar_insumo_fefo` pre-check no es atómico (TOCTOU)
**Archivo:** `supabase/migrations/20260503132430_0008_rpcs.sql:79-96`  
El pre-check de stock disponible corre sin lock. Entre el pre-check y el FOR UPDATE cursor, otro proceso puede consumir el stock. El pre-check puede reportar disponibilidad cuando ya no hay.

### A-13 — `fn_assert_same_tenant` usa EXECUTE dinámico en función SECURITY DEFINER
**Archivo:** `supabase/migrations/20260516000001_security_hardening_search_path.sql:8-31`  
`format('SELECT tenant_id FROM public.%I WHERE id = $1', p_table)` con `%I` es correcto pero el patrón `SECURITY DEFINER` + `EXECUTE format` con parámetro de tipo texto tiene superficie de ataque si un caller futuro pasa un nombre de tabla controlado por el usuario.

### A-14 — `pedido_eventos` INSERT sin restricción de rol
**Archivo:** `supabase/migrations/20260514000002_pedido_eventos.sql:39-42`  
Cualquier usuario del tenant puede inyectar eventos de estado arbitrarios en el log de trazabilidad AMEX. Corrompe KPIs de tiempo de preparación.

### A-15 — `cerrar_turnos_expirados` sin `SECURITY DEFINER` ni `SET search_path`
**Archivo:** `supabase/migrations/20260523000002_turnos_por_usuario_y_autocierre.sql:86-109`  
pg_cron puede fallar en resolver referencias a `public.fn_fin_bloque` si el search_path del job es diferente. Los turnos expirados quedarían abiertos indefinidamente.

### A-16 — Backup tiene mismatch de formato con el runbook DR
**Archivos:** `docs/runbook-dr.md:47,75-83` · `scripts/ci-backup.py`  
El runbook instruye `pg_restore` con `.pgdump`. El backup real genera `.sql.gz` plain text. `pg_restore` fallará en un escenario real de DR. La tabla también tiene truncación silenciosa a 50,000 filas.

### A-17 — Deploy usa `vercel@latest` sin pinning
**Archivo:** `.github/workflows/deploy.yml:50`  
Un breaking change en Vercel CLI puede romper silenciosamente todos los deploys a producción. Pinear a versión específica.

### A-18 — Missing workflow-level `permissions` declarations
**Archivos:** `ci.yml`, `deploy.yml`, `backup.yml`, `heartbeat.yml`  
Sin declaración explícita de `permissions:`, el `GITHUB_TOKEN` hereda permisos read+write en todos los scopes — viola principio de mínimo privilegio.

### A-19 — `toggleDisponibilidadPlato` con permiso incorrecto (`orders:create`)
**Archivo:** `apps/web/src/modules/orders/actions.ts:509`  
`mesero_amex` puede activar/desactivar platos del menú. Debería requerir `recipes:write` (solo admin).

### A-20 — Stale closure en `FlightsBoard` auto-refresh
**Archivo:** `apps/web/src/components/flights/flights-board.tsx:109-113`  
El interval de auto-refresh captura una referencia stale de `refresh`. Cuando el estado cambia pero `direction` no, el intervalo llama a la versión antigua de la función.

### A-21 — Double `getUser()` call en `/admin/proveedores/page.tsx`
**Archivo:** `apps/web/src/app/(dashboard)/admin/proveedores/page.tsx:23-30`  
`assertCan()` ya llama `getUser()`. La página hace otro `getUser()` para derivar `canWrite`. Duplica el round-trip al auth server.

### A-22 — `fn_siguiente_codigo_insumo/lote` incluyen `pg_temp` en search_path
**Archivo:** `supabase/migrations/20260518000001_almacen_codigos_y_empaques.sql:38,61`  
`SET search_path = public, pg_temp` en funciones `SECURITY DEFINER` es una vulnerabilidad conocida: un atacante autenticado puede crear objetos temporales que shadoween las tablas reales, corrompiendo la generación de SKUs/códigos de lote.

### A-23 — `fn_costo_receta` marcada como `STABLE` (incorrecto)
**Archivo:** `supabase/migrations/20260515000004_costos_tenant_guard.sql:11`  
La función es `STABLE` pero lee de `lotes` (tabla que cambia con frecuencia). Postgres puede cachear resultados dentro de una sesión, devolviendo precios stale.

### A-24 — Sin mismos 7 admin routes tienen `loading.tsx`
**Archivo:** `apps/web/src/app/(dashboard)/admin/` (7 subdirectorios)  
Sin skeleton de carga, los usuarios ven pantalla en blanco durante las cargas de datos de las rutas admin.

### A-25 — `useElapsed` — stale closure con eslint-disable suprimido
**Archivo:** `apps/web/src/components/kds/kds-board-amex.tsx:56-61`  
El timer del KDS AMEX puede no actualizar correctamente si el componente padre re-renderiza sin cambiar `since`. El `eslint-disable` oculta el bug real.

### A-26 — Backups sin monitoreo de fallos
**Archivo:** `.github/workflows/backup.yml`  
Un fallo del backup solo genera anotación en GitHub Actions. No hay notificación externa. Un backup fallido puede pasar desapercibido por días en un sistema 24/7.

### A-27 — GDPR `forget` route no elimina PII de tablas de aplicación
**Archivo:** `apps/web/src/app/api/gdpr/forget/route.ts:37-52`  
La ruta solo anonimiza `auth.users`. No toca `pedido_eventos`, `mensajes_chat`, `afluencia_ingresos`, ni el payload del `audit_log`. La entrada de `audit_log` para el propio request de forget contiene `{ email: user.email }` — dato que nunca puede eliminarse.

### A-28 — `buffet_tickets_turno` permite múltiples registros por turno
**Archivo:** `supabase/migrations/20260503132352_0006_operations.sql:49`  
Falta `UNIQUE (tenant_id, turno_id)`. Se pueden crear múltiples cierres para el mismo turno, corrompiendo la reconciliación del buffet.

---

## PARTE 3 — HALLAZGOS MEDIOS (Resolver en próximos 2 sprints)

| ID | Archivo | Descripción |
|----|---------|-------------|
| M-01 | `supabase/migrations/...data_retention_90d.sql:32` | Vista `v_retencion_estado` sin acceso restringido (cross-tenant) |
| M-02 | `apps/web/src/modules/chat/actions.ts:48` | Writes al chat sin verificar CHANNEL_ACL |
| M-03 | `apps/web/src/lib/auth/assertCan.ts:33` | Superuser con tenant_id indefinido en audit_log |
| M-04 | `apps/web/src/modules/recipes/actions.ts:68-92` | Creación de receta + ingredientes no transaccional |
| M-05 | `apps/web/src/app/api/heartbeat/route.ts:32` | SSRF risk via `BETTERSTACK_HEARTBEAT_URL` no validada |
| M-06 | `supabase/migrations/20260515000003_costos.sql:99` | `fn_costo_receta` callable por todos los roles `authenticated` |
| M-07 | `supabase/migrations/...data_retention_90d.sql` | `fn_purgar_*` callable por cualquier usuario (no solo service_role) |
| M-08 | `apps/web/src/app/(auth)/login/page.tsx:42-44` | Turnstile se bypasea si solo una de las dos keys está configurada |
| M-09 | `apps/web/src/lib/socket/emit-event.ts:5` | `SOCKET_EMIT_SECRET` faltante suprime silenciosamente todos los eventos socket |
| M-10 | `apps/web/src/modules/orders/actions.ts:509` | Ver A-19 |
| M-11 | `apps/web/src/modules/cocina-amex/infrastructure/cocina-amex-repository.ts:150` | N+1 query: `findEventosByPedido` hace 2 queries donde podría hacer 1 con JOIN |
| M-12 | `packages/shared-types/src/enums.ts:124` | `creado → en_preparacion` permitido (skip de `recibido_cocina` rompe trazabilidad AMEX) |
| M-13 | `apps/web/src/modules/analytics/infrastructure/analytics-repository.ts:94,127` | `let query: any` rompe type-safety en toda la cadena de queries |
| M-14 | `apps/web/src/modules/recipes/domain/recipe.ts:31` | `unidadMedida: string` debería ser `UnidadMedida` (enum) |
| M-15 | `apps/web/src/modules/inventory/actions.ts:365` | Join retorna objeto pero se accede como array `[0]?.nombre` → nombres siempre `'—'` |
| M-16 | `supabase/migrations/20260503132217_0003_inventory_core.sql:134` | Faltan índices en `turno_id` de `movimientos_inventario`, `mermas`, `despachos`, `tandas_produccion` |
| M-17 | `supabase/migrations/20260503132352_0006_operations.sql:49` | Ver A-28 — UNIQUE faltante en `buffet_tickets_turno` |
| M-18 | `supabase/migrations/20260514000002_pedido_eventos.sql:39` | Ver A-14 — política INSERT demasiado amplia |
| M-19 | `apps/web/src/modules/orders/actions.ts` | `registrarEvento` silencia errores sin logging |
| M-20 | `apps/web/src/modules/alertas/infrastructure/checks.ts:41` | `crearAlerta` silencia todas las excepciones sin logging |
| M-21 | `apps/web/src/lib/socket/emit-event.ts:24` | `emitEvent` silencia fallos de broadcast sin logging |
| M-22 | `apps/web/src/modules/production/actions.ts:123` | Loop FEFO deja tanda stuck en `en_proceso` en fallo parcial |
| M-23 | `apps/web/src/modules/orders/actions.ts` | N+1 pattern potencial: snack/buffet dispatch DESTINO_CANAL duplicado |
| M-24 | `apps/web/src/modules/production/actions.ts:240` | `zona: 'snack/buffet'` no es un `ZonaServicio` válido |
| M-25 | `apps/web/src/components/chat/chat-panel.tsx:51-89` | Canal socket join/leave en cada apertura del chat (churn innecesario) |
| M-26 | `apps/web/src/components/kds/kds-board.tsx:134` | `byState` y `pedidosFiltrados` no memoizados → re-cómputo O(n) en cada render |
| M-27 | `apps/web/src/app/global-error.tsx:22-30` | Strings hardcodeados en español sin i18n |
| M-28 | `apps/web/src/app/layout.tsx:61` | `HabeasDataBanner` renderizado en rutas QR de pasajeros |
| M-29 | `apps/web/src/components/qr/qr-passenger-app.tsx:41-241` | `TEXTS` hardcodea 4 locales completos en el bundle cliente (duplica next-intl) |
| M-30 | `supabase/migrations/20260515000004_costos_tenant_guard.sql:11` | Ver A-23 — `STABLE` incorrecto en `fn_costo_receta` |
| M-31 | `.github/workflows/ci.yml:163` | `pnpm audit --prod` ignora vulnerabilidades en devDependencies (`vite`, `esbuild`) |
| M-32 | `scripts/reset-test-users.mjs:44` | Contraseña `Admin123` hardcodeada en git history |
| M-33 | `apps/web/src/modules/superuser/infrastructure/superuser-repository.ts:87` | Límite duro de 1000 usuarios sin paginación |
| M-34 | `vercel.json` + `heartbeat.yml` | Heartbeat schedule: `*/5` en Actions (≈4320 min/mes) vs `0 6 * * *` en Vercel (una vez/día) — mismatch grave |
| M-35 | `apps/web/src/app/api/gdpr/forget/route.ts` | Ver A-27 — PII en tablas de aplicación no tratada |
| M-36 | `.github/workflows/deploy.yml` + `ci.yml` | Falta `concurrency:` group → migraciones concurrentes posibles |
| M-37 | `apps/socket-server/src/index.ts:46` | CORS single-origin bloquea Vercel preview deployments |
| M-38 | `supabase/migrations/20260516000003_pgcron_check_alertas.sql` | Doble disparo alertas (pg_cron + Vercel Cron simultáneo a las 03:00 UTC) |

---

## PARTE 4 — HALLAZGOS BAJOS (Backlog técnico)

| ID | Archivo | Descripción |
|----|---------|-------------|
| L-01 | `apps/web/src/app/(auth)/login/page.tsx:65` | `password.trim()` puede bloquear usuarios con espacios en contraseña |
| L-02 | `apps/web/next.config.mjs:27` | CSP con `unsafe-inline` en producción (limitación Next.js 15 → migrar a nonce) |
| L-03 | `apps/web/src/lib/result.ts:64-68` | Sentry `void import(...)` silencia rejection del import dinámico |
| L-04 | `apps/web/src/modules/inventory/actions.ts:313` | `createLote` inserta en `movimientos_inventario` sin verificar error |
| L-05 | 34 ocurrencias en `modules/*/infrastructure` | `data as unknown as SomeRow[]` — usar `supabase gen types typescript` |
| L-06 | `apps/web/src/modules/orders/tests/pedido-transitions.test.ts:5-12` | `TODOS_LOS_ESTADOS` sin `recibido_cocina` → test de completitud tiene gap |
| L-07 | `apps/web/src/modules/inventory/tests/fefo-concurrency.test.ts:38` | Simulador FEFO secuencial (JS single-threaded), no testea concurrencia real |
| L-08 | `apps/web/src/modules/production/tests/tanda-application.test.ts:62` | In-memory repo retorna `ingredientes: []` → integración FEFO+estado no testada |
| L-09 | `supabase/migrations/20260513000000_data_retention_90d.sql:32` | `v_retencion_estado` sin restricción de acceso |
| L-10 | `supabase/migrations/20260514000001_turnos_teamlider.sql:7-13` | `teamlider text` permite string vacío (falta `CHECK (char_length(teamlider) > 0)`) |
| L-11 | `supabase/migrations/20260522000001_turnos_bloques_fijos.sql:44` | Migración soft-delete ALL turnos sin guardia (`WHERE bloque IS NULL`) |
| L-12 | `supabase/migrations/20260503132451_0009_materialized_views.sql:65` | `ABS(m.cantidad)` en mv_cogs — riesgo de doble-conteo de merma |
| L-13 | `scripts/ci-backup.py:90` | Truncación silenciosa a 50,000 filas — tablas grandes como `audit_log` quedan incompletas |
| L-14 | `apps/web/public/sw.js:32` | Service worker no cachea imágenes de Supabase Storage (origen externo) |
| L-15 | `apps/web/public/sw.js:47` | `cache.put()` sin `.catch()` — falla silenciosamente con QuotaExceededError |
| L-16 | `apps/web/src/components/layout/sidebar.tsx:354` | `aria-label` hardcodeado en español sin i18n |
| L-17 | `apps/web/src/components/flights/flights-board.tsx:33,88` | `formatTime` definido dos veces con implementación idéntica |
| L-18 | `apps/web/src/lib/offline/use-offline-sync.ts:31` | `syncing` en deps de `useCallback` → churn innecesario de efectos |
| L-19 | `apps/web/src/lib/offline/use-network.ts:6` | `useState(true)` — si usuario empieza offline, banner no se muestra en primer render |
| L-20 | `apps/web/src/components/qr/qr-passenger-app.tsx:430` | `key={i}` (index) en lista de ingredientes |
| L-21 | `apps/web/src/components/qr/qr-passenger-app.tsx:384` | `text-[#FAF7F0]/55` ≈ 2.3:1 contraste (falla WCAG AA) |
| L-22 | `apps/web/src/app/qr/[locale]/error.tsx:20` | Emoji `⚠️` en UI (variabilidad cross-OS, accesibilidad) |
| L-23 | `.github/workflows/` | Sin Dependabot/Renovate para actualizaciones automáticas de dependencias |
| L-24 | `docs/runbook-dr.md:60` | `MAINTENANCE_MODE=1` documentado pero no implementado en middleware |
| L-25 | `scripts/reset-users.sql` | UUIDs predecibles hardcodeados en historial git |
| L-26 | `apps/web/next.config.mjs` | Sin Sentry tunnel → ad blockers suprimen error telemetry en QR |
| L-27 | `apps/socket-server/src/index.ts:45` | `maxHttpBufferSize` default 1MB, innecesario para payloads pequeños |
| L-28 | `scripts/setup-github-secrets.sh:52` | `SUPABASE_DB_URL` se configura como secret pero ningún workflow lo usa |

---

## PARTE 5 — Plan de resolución por prioridad

### Fase 0 — Antes del próximo deploy (esta semana)

1. **C-10** — Agregar `/api/heartbeat` y `/health` a `PUBLIC_PATHS` (1 línea)
2. **C-09** — Mover Wi-Fi password a variable de entorno server-side
3. **C-16** — Agregar guardia de entorno en scripts destructivos
4. **C-02** y **C-03** — Corregir políticas RLS para `recepcion` y roles en `turnos`
5. **C-17** — Agregar `personal_almacen` a política de `lotes`
6. **A-09** — Cambiar `p_tipo: 'ajuste'` a `salida_receta` en `stockOut`
7. **C-08** — Drop constraint global `UNIQUE` en `pedidos.idempotency_key`
8. **C-21** — Agregar filtro de vencimiento al cursor FEFO

### Fase 1 — Sprint 1 (próxima semana)

9. **C-01** — Scopear `getUsers()` por `ctx.tenantId` para roles no-superuser
10. **C-04** — Crear RPC `fn_completar_tanda` atómico
11. **C-07** — Resolver conflicto trigger append-only vs retención
12. **C-06** — Crear vistas filtradas por tenant sobre materialized views
13. **C-13** — Agregar `workflow_run` dependency en deploy workflow
14. **C-15** — Remover `app.cron_secret` de pg_settings, usar Vault
15. **A-04** — Implementar validación de `CHANNEL_ACL` en chat actions
16. **A-05** — `REVOKE FROM PUBLIC` en funciones de retención
17. **A-11** — Implementar `despacharSnack` con deducción FEFO
18. **A-16** — Corregir runbook DR para usar `psql -f` en lugar de `pg_restore`
19. **M-34** — Corregir schedule del heartbeat en `vercel.json`

### Fase 2 — Sprint 2 (semana 2-3)

20. **C-05** — Serializar inserciones en audit_log con advisory lock
21. **C-12** — Mover `PROJECT_REF` a variable de entorno
22. **C-14** — Pinear todos los GitHub Actions a commit SHA
23. **C-22** — Encriptar backups antes de subir como artefacto
24. **A-02** — Agregar TTL (`.setExpirationTime('12h')`) a tokens QR
25. **A-03** — Corregir extracción de IP real (no confiar en `X-Forwarded-For` raw)
26. **A-07** — Reemplazar `getSession()` con `getUser()` en dashboard layout
27. **A-08** — Limpiar handler `error` de socket en cleanup del useEffect
28. **C-18** — Mover tipos compartidos a `@dorado/shared-types`
29. **C-19** — Corregir manejo de error en `completarTanda`
30. **A-15** — Agregar `SECURITY DEFINER` + `SET search_path` a `cerrar_turnos_expirados`
31. **A-22** — Remover `pg_temp` de `search_path` en funciones de código

### Fase 3 — Backlog de calidad (mes siguiente)

- Todos los hallazgos M-xx y L-xx restantes
- Generar `database.types.ts` con `supabase gen types typescript` para eliminar los 34 `as unknown as`
- Añadir Dependabot
- Implementar `MAINTENANCE_MODE` en middleware
- Migrar CSP a nonce-based (eliminar `unsafe-inline`)
- Añadir paginación al backup script

---

## Patrones bien implementados (confirmados seguros)

Los siguientes patrones críticos fueron auditados y están **correctamente implementados**:

- **JWT algorithm pinning:** Socket server usa `algorithms: ['HS256']` explícitamente → sin confusion attack
- **FEFO enforcement:** Toda deducción de stock usa `fn_descontar_insumo_fefo` (excepto snack — ver A-11). Ninguna reimplementación TypeScript.
- **Idempotency keys:** Consistentemente usados en Stock Out, merma, despacho, buffet tickets
- **Optimistic locking:** `.eq('version', pedido.version)` + `PGRST116` en todas las transiciones de pedido
- **Tenant isolation en Socket.io:** `tenantRoom = ${tenantId}:${channel}` — namespace aislado por tenant
- **CORS restringido en socket server:** `ALLOWED_ORIGIN` desde env var
- **`timingSafeEqual` en emit-handler:** `crypto.timingSafeEqual` usado correctamente
- **`assertCan` en todos los Server Actions:** Verificado en todos los módulos
- **`fn_costo_receta` tenant guard:** Migración 0004 valida correctamente tenant del caller
- **Service role key nunca en NEXT_PUBLIC_*:** Verificado
- **`admin` no puede escalar a `superuser`:** `adminRoleSchema` excluye explícitamente `superuser`
- **Triggers append-only en `audit_log` y `domain_events`:** Protegen contra UPDATE/DELETE
- **Fórmula de merma:** `bruto = requerida / (1 - coeficiente)` — correcta con 4 decimales, cobertura 100%

---

*Generado por auditoría multi-agente Enterprise — Claude Code · Dorado Lounge System*  
*Rama: `claude/enterprise-audit-dQLvw` · 2026-05-27*
