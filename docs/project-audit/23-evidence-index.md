# 23 · Índice de evidencia y contradicciones

---

# Parte A · Evidencia ejecutada

Todo lo siguiente se ejecutó en esta sesión, el **2026-08-30**, sobre el commit `828ab9d`.
Las salidas son literales.

## A.1 · Cadena de herramientas

```
$ pnpm install --frozen-lockfile
  Done in 13.2s using pnpm v10.33.2                                    [exit 0]

$ pnpm typecheck
  Scope: 5 of 6 workspace projects
  packages/shared-types  · packages/shared-validation
  apps/socket-server     · apps/web                    → Done            [exit 0]

$ pnpm lint
  apps/socket-server: Done
  apps/web: ✔ No ESLint warnings or errors                              [exit 0]

$ pnpm test
  packages/shared-types       →  3 ficheros ·  44 pruebas
  packages/shared-validation  →  2 ficheros ·  47 pruebas
  apps/socket-server          →  1 fichero  ·  24 pruebas
  apps/web                    → 50 ficheros · 452 pruebas
  TOTAL                       → 56 ficheros · 567 pruebas                [exit 0]

$ pnpm --filter @dorado/web exec vitest run --coverage
  All files → 91.53 % stmts · 94.18 % branch · 96 % funcs               [exit 0]

$ pnpm --filter @dorado/web build
  ✓ Compiled successfully in 80s
  ✓ Generating static pages (23/23)
  29 rutas · 226 kB de JS compartido · Middleware 155 kB                [exit 0]
```

## A.2 · Servidor en ejecución

`next start -p 3100` con variables de Supabase de marcador. Peticiones reales con `curl`:

| Petición                      | Resultado                                        |
| ----------------------------- | ------------------------------------------------ |
| `GET /health`                 | `200` `{"status":"ok","service":"dorado-web",…}` |
| `GET /login`                  | `200` HTML                                       |
| `GET /qr/es`                  | `200` HTML                                       |
| `GET /`                       | `302` → `/login?next=%2F`                        |
| `GET /inventario`             | `302` → `/login?next=%2Finventario`              |
| `GET /api/heartbeat`          | `500` `{"error":"SERVER_MISCONFIGURED"}`         |
| `GET /api/cron/check-alertas` | `500` `{"error":"SERVER_MISCONFIGURED"}`         |
| `POST /api/gdpr/forget`       | `302` → `/login?next=…`                          |

Cabeceras reales de `/login`: `X-Frame-Options: DENY` · `X-Content-Type-Options: nosniff` ·
`Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy` ·
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ·
`Content-Security-Policy` con `nonce-uVnIrNbfY5iQ4caIYbWGig==` distinto en cada respuesta.

## A.3 · Base de datos reconstruida desde cero

Cluster PostgreSQL 16 efímero, con el arnés del propio repositorio:

```
$ PGROOT=/var/tmp/pgv ./scripts/sql-harness/run-tests.sh
  ✓ f001_signup_no_escala_privilegios      ✓ f009_transicion_item_atomica
  ✓ f002_principio_rector                  ✓ f021_costos_por_lote
  ✓ f002_sin_borrado_duro                  ✓ f022_merma_atomica
  ✓ f004_turno_en_ledger                   ✓ f036_insert_exige_permiso
  ✓ f005_analytics_refrescable             ✓ f037_capa2_se_materializa
  ✓ f006_roles_produccion_pueden_escribir
  ✓ f008_entrega_atomica
  RLS/RPC: 12 pasaron, 0 fallaron
```

Las 80 migraciones aplican sin un solo error.

## A.4 · Verificación de las afirmaciones de `ESTADO-Y-PROXIMOS-PASOS.md`

El propio repositorio incluye cuatro consultas para que quien retome compruebe el estado
_"sin depender de lo que diga nadie"_. Ejecutadas sobre la base reconstruida:

| Consulta                                           | Declarado   | Medido        |
| -------------------------------------------------- | ----------- | ------------- |
| Migraciones aplicadas                              | 80          | **80** ✅     |
| `SELECT count(*) FROM public.rbac_permisos`        | 144         | **144** ✅    |
| Grants de `authenticated` sobre `pedidos`          | solo SELECT | **SELECT** ✅ |
| `SELECT count(*) FROM pg_policies WHERE cmd='ALL'` | 0           | **0** ✅      |

Las cuatro coinciden.

## A.5 · Reproducción del hallazgo H-A

```sql
BEGIN;
SELECT test.login('aaaaaaaa-0000-0000-0000-000000000001');  -- admin del seed
SELECT current_user, auth.jwt()->'app_metadata'->>'role';
--  current_user  |  rol
-- ---------------+-------
--  authenticated | admin

SELECT * FROM public.v_consumo_vs_produccion_turno_tenant LIMIT 1;
-- ERROR:  permission denied for materialized view mv_consumo_vs_produccion_turno
```

Causa, en `pg_class`:

```
mv_consumo_vs_produccion_turno       reloptions: (ninguna)
  relacl: {postgres=arwdDxt/postgres, service_role=arwd/postgres}   ← sin 'authenticated'

v_consumo_vs_produccion_turno_tenant reloptions: {security_invoker=true}
  relacl: {postgres=…, anon=arw, authenticated=arw, service_role=arwd}
```

## A.6 · Reproducción del hallazgo H-B

```sql
BEGIN;
INSERT INTO public.movimientos_inventario (tenant_id, insumo_id, tipo, cantidad, turno_id)
SELECT t.id, i.id, 'entrada', 10, tu.id FROM tenants t
  JOIN insumos i ON i.tenant_id=t.id JOIN turnos tu ON tu.tenant_id=t.id LIMIT 1;
REFRESH MATERIALIZED VIEW public.mv_consumo_vs_produccion_turno;

SELECT count(*) FROM public.mv_consumo_vs_produccion_turno;   -- → 1

SET LOCAL ROLE service_role;                                   -- como createAdminClient()
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT count(*) FROM public.v_consumo_vs_produccion_turno_tenant;  -- → 0
ROLLBACK;
```

## A.7 · Evidencia de H-C, H-D y H-E

**H-C.** `grep -n "emit('join'" apps/web/src/components/alertas/alertas-bell.tsx` → sin
resultados. El fichero contiene `socket.on('event', handle)` pero ninguna llamada a `join`.
El servidor difunde con `io.to(\`${tenantId}:${channel}\`)`
(`apps/socket-server/src/lib/emit-handler.ts`).

**H-D.**

```sql
SELECT jobname, schedule FROM cron.job;
--  cerrar-turnos-expirados | */15 * * * *
--  check-alertas           | */5 * * * *
```

Ninguno refresca la vista materializada.

**H-E.** `modules/orders/actions.ts:275-281` emite a `CHANNELS.COCINA`, `COCINA_AMEX` y
`COCINA_PASTELERIA`. `app/qr/[locale]/actions.ts` emite solo a `CHANNELS.COCINA`.

## A.8 · Métricas medidas

| Métrica                               |              Valor | Cómo se obtuvo                       |
| ------------------------------------- | -----------------: | ------------------------------------ |
| Ficheros TS/TSX                       |                338 | `find`                               |
| LOC producción                        |             28 156 | `wc -l` excluyendo pruebas           |
| LOC pruebas                           |              7 225 | `wc -l` de `*.test.ts` / `*.spec.ts` |
| LOC bajo umbral de cobertura          |              2 279 | `wc -l` del `include` de vitest      |
| Componentes React                     |                 78 | `find components -name '*.tsx'`      |
| Server Actions                        |                 81 | `grep '^export async function'`      |
| Migraciones                           |                 80 | `ls supabase/migrations/*.sql`       |
| Tablas · políticas RLS · índices · FK | 25 · 48 · 109 · 67 | catálogos de PostgreSQL              |
| Claves i18n `es` / `en`               |          989 / 989 | recorrido recursivo del JSON         |
| `TODO`/`FIXME`/`HACK` reales          |                  0 | `grep`                               |
| `console.log`                         |                  0 | `grep`                               |
| Secretos hardcodeados                 |                  0 | `grep -E` de patrones de credencial  |

---

# Parte B · Contradicciones detectadas

Segunda revisión cruzando documentación ↔ código ↔ base de datos ↔ configuración.

## B.1 · `CLAUDE.md` vs código

| #   | Documentación                                                                                | Realidad verificada                                                                                                                                                             | Gravedad                                     |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Tabla de UIs por rol: `chef` → `/cocina` — "KDS supervisor, vista combinada Caliente + Fría" | **No existe `/cocina`** en `app/`. El rol `chef` está marcado como deprecado en `enums.ts`: "ya no es asignable ni navegable"                                                   | 🟠 Media — describe una pantalla inexistente |
| 2   | «Auth QR: `JWT_PASSENGER_SECRET` — tokens QR anónimos de mesa (**4h TTL**)»                  | `lib/qr/token.ts`: `const QR_TOKEN_TTL = '12h'`. El tracker (F-028) dice "se documentó el valor real"; **`CLAUDE.md` no se actualizó**                                          | 🟠 Media — seguridad                         |
| 3   | «Canal sin permiso → desconexión inmediata + `audit_log` (evento de seguridad)»              | El socket-server registra en logger y Sentry. El propio código dice: _"no se registra en audit_log aquí"_                                                                       | 🟡 Baja                                      |
| 4   | «Analytics: filtros obligatorios: **turno, nodo, responsable, período**»                     | La vista solo tiene dimensiones turno × insumo. Nodo y responsable **no existen**; están implementados turno, desde y hasta                                                     | 🟠 Media                                     |
| 5   | Stack: «Supabase (PostgreSQL 15 + Auth + **Storage**)»                                       | **Cero llamadas a `supabase.storage`** en todo el repositorio                                                                                                                   | 🟡 Baja                                      |
| 6   | Lista de tablas existentes (24)                                                              | Son **25**: falta `rbac_permisos`, central para la autorización                                                                                                                 | 🟡 Baja                                      |
| 7   | «Turnos — campos requeridos: `usuario`, `rol`, `teamlider`, `login_time`, `logout_time`»     | Las columnas reales son `responsable_id`, `teamlider`, `iniciado_at`, `cerrado_at`, `bloque`, `cierre_motivo`. Semánticamente equivalente, nominalmente distinto                | ⚪ Cosmética                                 |
| 8   | Regla 6: «Idempotencia offline: Stock Out, despacho y tickets»                               | Las `idempotency_key` existen, pero **no hay cola offline** para esas operaciones; la que hay sirve solo al QR del pasajero. Y "tickets" ya no es una funcionalidad del sistema | 🟡 Baja                                      |
| 9   | Regla 7: «UI strings: nunca hardcoded — siempre vía next-intl»                               | `components/qr/offline-banner.tsx` lleva un objeto `TEXTS` con los 4 idiomas escritos a mano                                                                                    | 🟡 Baja                                      |

## B.2 · `REMEDIATION_TRACKER.md` vs realidad medida

| Declarado                                                                           | Medido hoy                                                                                                 | Lectura                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| «507 pruebas (394 web, 45 validación, 44 tipos, 24 socket)»                         | **567** (452 web, 47 validación, 44 tipos, 24 socket)                                                      | Deriva **por debajo**: el trabajo creció después. Sin riesgo |
| «11 suites de RLS/RPC»                                                              | **12**                                                                                                     | Ídem                                                         |
| F-005 «vistas materializadas nunca pobladas → Verificado, riesgo residual: Ninguno» | La vista **se puebla**, pero **no se puede leer** (H-A). La prueba `f005` cubre el refresco, no la lectura | 🔴 El "riesgo residual: ninguno" es incorrecto               |
| F-028 «TTL del token QR — se documentó el valor real»                               | `CLAUDE.md` sigue diciendo 4 h                                                                             | 🟠 El cierre no se completó                                  |

## B.3 · Contrato de tiempo real vs implementación

`packages/shared-types/src/socket-events.ts` se declara **autoritativo**. Describe 11 canales
y 10 eventos. Conectados de extremo a extremo: **7 canales y 4 eventos.**

| Elemento                                   | Estado                             |
| ------------------------------------------ | ---------------------------------- |
| `STOCK_OUT`, `DESPACHO`                    | Ni emisor ni consumidor            |
| `SOLICITUD_PREPARACION`                    | Consumidor sin emisor              |
| `PEDIDO_COCINERO`, `TURNO_EVENTO`          | Emisor sin consumidor              |
| `sala:cocina:fria`, `sala:cocina:caliente` | Solo reciben alertas; nadie se une |
| `sala:broadcast:cocina`                    | Alguien se une; nadie emite        |
| `sala:admin`                               | Se emite; nadie se une             |

## B.4 · Interfaz sin respaldo funcional

| Elemento                            | Problema                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `SolicitudesPanel` en `/pasteleria` | `getSolicitudesCocina()` devuelve `ok([])` incondicionalmente. La tabla nunca tendrá filas |
| Pantalla `/analytics`               | Muestra el mensaje de error de la base, no datos                                           |
| Clave i18n `common.export`          | No hay ninguna acción de exportación en el repositorio                                     |

**El caso inverso no se da:** no hay ningún botón que llame a una acción inexistente, ni
ninguna acción que apunte a una tabla que no esté, ni ninguna escritura sin `assertCan`.

## B.5 · Base de datos vs código

| Contradicción                                                                                                                 | Gravedad                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `refresh_analytics_views` itera sobre `mv_cogs_per_passenger`, eliminada en `20260528000000`                                  | 🟡 Inocua (hay guarda de existencia)                         |
| ENUM `tipo_acceso_sala` sin ninguna tabla que lo use                                                                          | 🟡 Limpieza                                                  |
| `lotes.proveedor` (texto libre) coexiste con `lotes.proveedor_id` (FK)                                                        | 🟡 Deuda de migración                                        |
| Valores inertes en `user_role` (`chef`, `recepcion`), `unidad_medida` (`kg`,`l`,`lb`,`porcion`), `area_produccion` (`cocina`) | ⚪ Inevitable: Postgres no permite quitar valores de un ENUM |

---

# Parte C · Alcance de esta auditoría

## Se verificó ejecutando

Instalación · typecheck · lint · 567 pruebas unitarias · cobertura · build de producción ·
arranque del servidor y peticiones HTTP reales · aplicación de las 80 migraciones sobre
PostgreSQL limpio · 12 suites de RLS/RPC · introspección completa de catálogos · reproducción
de los hallazgos H-A y H-B con SQL.

## Se verificó solo leyendo el código

Los 78 componentes React · las 31 pruebas E2E de Playwright · los workflows de GitHub Actions ·
la configuración de Vercel y Render · los adaptadores de Supabase en tiempo de ejecución.

## No se pudo verificar

| Punto                                                             | Motivo                                |
| ----------------------------------------------------------------- | ------------------------------------- |
| Comportamiento contra un Supabase real (Auth, PostgREST, Storage) | Sin credenciales en el entorno        |
| Ejecución de las pruebas E2E                                      | Exigen staging con usuarios sembrados |
| Rotación de `SUPABASE_JWT_SECRET` (acción de F-027)               | Configuración externa                 |
| Registro público deshabilitado en Supabase Auth (F-001)           | Configuración externa                 |
| `ALLOW_LEGACY_HS256` apagada en Render                            | Variable del servicio                 |
| Monitor HTTP contra `/health` en Better Stack (F-011)             | Configuración externa                 |
| Rendimiento real en producción                                    | Sin acceso a métricas                 |

**En ningún punto de estos documentos se presenta como "probado" algo que solo se leyó.**
