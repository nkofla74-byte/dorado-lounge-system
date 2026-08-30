# 17 · Funcionalidades terminadas

Solo entra aquí lo que se puede demostrar con código **y** cuya cadena completa
(UI → acción → permiso → base → respuesta → error) se verificó.

Formato de evidencia, por Fase 19 del encargo:

> **Funcionalidad** · **Estado** · **Evidencia** (ficheros) · **Backend** · **Base de datos**
> · **Explicación del comportamiento real**

---

## 1. Autenticación y control de acceso · 🟢 COMPLETA

**Evidencia:** `app/(auth)/login/{page,actions}.tsx` · `middleware.ts` ·
`lib/auth/{assertCan,role-home,rutas-publicas,login-throttle}.ts`
**Backend:** Supabase Auth + Server Action `iniciarSesion`
**Base de datos:** `auth.users`, `public.users`, `rbac_permisos`
**Pruebas:** 11 (login) + 11 (assertCan) + 15 (role-home) + 4 (rutas públicas) + 5 (throttle)

**Comportamiento real:** el empleado introduce credenciales; se aplica rate limit por cuenta
(5/15 min), se verifica Turnstile y el token se reenvía a Supabase como `captchaToken`. Al
autenticarse se le redirige a la pantalla propia de su rol. El middleware bloquea cualquier
ruta fuera de su whitelist. Cada Server Action revalida la sesión **releyendo la fila del
usuario**, de modo que desactivar a alguien corta su acceso en la siguiente acción.

**Verificado ejecutando:** `GET /inventario` sin sesión → `302 → /login?next=%2Finventario`.

---

## 2. Recepción de mercancía con merma · 🟢 COMPLETA

**Evidencia:** `components/inventory/{lotes-sheet,nuevo-ingreso-dialog}.tsx` ·
`modules/inventory/domain/merma.ts` · `modules/inventory/actions.ts`
**Base de datos:** `lotes`, `insumos.merma_default`, `fn_siguiente_codigo_lote`
**Pruebas:** 35 solo del dominio de merma, con umbral de cobertura del 90 %

**Comportamiento real:** al registrar un lote se aplica `comprado × (1 − coef)` y se guarda la
cantidad **neta**; el coste unitario se recalcula como `costo / (1 − coef)` para preservar el
valor total. El código de lote lo genera un contador por tenant en base. A partir de ahí el
lote entra en la cola FEFO.

---

## 3. Descuento FEFO atómico · 🟢 COMPLETA

**Evidencia:** `fn_descontar_insumo_fefo` (`20260615000000_fix_fefo_overload_security.sql`) ·
`modules/inventory/actions.ts` → `stockOut`
**Base de datos:** `lotes`, `movimientos_inventario`, `operaciones_idempotentes`
**Pruebas:** `f002_principio_rector`, `f008_entrega_atomica` (RLS, ejecutadas y verdes)

**Comportamiento real:** toda deducción de stock pasa por una única función de Postgres,
atómica con `FOR UPDATE` e idempotente por `idempotency_key`. **No está reimplementada en
TypeScript.** Un intento de descontar por escritura directa desde PostgREST se deniega — y hay
una prueba que lo demuestra.

---

## 4. Autorización en dos capas con matriz generada · 🟢 COMPLETA

**Evidencia:** `lib/auth/permissions.ts` · `lib/auth/rbac-sql.ts` ·
`20260822000002_rbac_matriz.sql`
**Base de datos:** `rbac_permisos` (**144 filas verificadas**), `fn_puede`, `fn_puede_en_tenant`
**Pruebas:** `rbac-sql.test.ts` + `f006_roles_produccion_pueden_escribir`

**Comportamiento real:** la matriz de permisos vive en TypeScript y se **genera** hacia SQL con
`pnpm rbac:generate`. Una prueba de Vitest falla si alguien cambia una sin regenerar la otra.
Ningún desarrollador escribe listas de roles a mano dentro de una política RLS.

---

## 5. Escritura de pedidos exclusivamente por RPC · 🟢 COMPLETA

**Evidencia:** `20260822000005_pedidos_rpc.sql` (535 líneas) ·
`modules/orders/infrastructure/order-repository.ts`
**Base de datos:** 6 RPC `SECURITY DEFINER`; `authenticated` solo tiene `SELECT`
**Pruebas:** `f008`, `f009`, `f036` (RLS) + `optimistic-locking`, `idempotency`, `tenant-isolation`

**Verificado en base:** `SELECT privilege_type … WHERE table_name='pedidos' AND
grantee='authenticated'` → **`SELECT`** y nada más. `SELECT count(*) FROM pg_policies WHERE
cmd='ALL'` → **0**.

---

## 6. KDS por área con estado por ítem · 🟢 COMPLETA

**Evidencia:** `components/kds/{kds-board-area,pedido-card}.tsx` ·
`modules/orders/actions.ts` → `iniciarItem`, `marcarItemListo`, `recallItem`
**Base de datos:** `pedido_items.estado`, `pedido_item_eventos`, `fn_transicionar_item`
**Pruebas:** `actions-item-transitions.test.ts` + `f009_transicion_item_atomica`

**Comportamiento real:** cada plato tiene su propio estado y su propio cronómetro. Al marcar un
ítem, la RPC bloquea el pedido (`FOR UPDATE`), actualiza el ítem, registra el evento en el log
append-only y **recalcula el estado agregado del pedido**. El cliente nunca decide el estado
del pedido. La urgencia se colorea por tiempo transcurrido (>8 min aviso, >15 min crítico).

---

## 7. KDS AMEX con trazabilidad y timers · 🟢 COMPLETA

**Evidencia:** `components/kds/kds-board-amex.tsx` (418 L) · `modules/cocina-amex/`
**Base de datos:** `pedidos`, `pedido_eventos`
**Pruebas:** `cocina-amex-domain.test.ts` (9)

Único punto del sistema con **actualización optimista** y con limpieza correcta de la
suscripción al socket (`leave` al desmontar).

---

## 8. Ciclo completo del pedido con entrega atómica · 🟢 COMPLETA

**Evidencia:** `modules/orders/actions.ts` → `entregarPedido` · `fn_entregar_pedido`
**Base de datos:** `pedidos`, `pedido_items`, `lotes`, `movimientos_inventario`
**Pruebas:** `f008_entrega_atomica` (RLS) + `actions-entregar-pedido.test.ts`

**Comportamiento real:** al confirmar la entrega, una sola transacción bloquea el pedido,
descuenta por FEFO **todos** los ingredientes de **todas** las recetas del pedido y transiciona
a `entregado`. O se hace todo, o no se hace nada.

---

## 9. Requisiciones cocina → almacén · 🟢 COMPLETA

**Evidencia:** `modules/requisiciones/` completo · `components/requisiciones/` (3 componentes)
**Base de datos:** `requisiciones`, `requisicion_items`, `requisicion_eventos` (inmutable)
**Pruebas:** 3 ficheros (dominio, aplicación, acciones)

**Es el único flujo con tiempo real funcionando de extremo a extremo:**
`RequisicionesPanel` sí ejecuta `socket.emit('join', CHANNELS.ALMACEN)` y refresca al recibir
`REQUISICION_ESTADO`.

---

## 10. Producción por tandas con materialización de capa 2 · 🟢 COMPLETA

**Evidencia:** `modules/production/` · `fn_completar_tanda`
(`20260824000003_fn_completar_tanda_materializa.sql`)
**Base de datos:** `tandas_produccion`, `lotes`, `movimientos_inventario`
**Pruebas:** `f037_capa2_se_materializa` (RLS) + 3 ficheros de Vitest

Al completar una tanda se crea el lote del elaborado (capa 2) en la misma transacción, usando
`recetas.rendimiento_cantidad`. La base exige ese campo con un CHECK.

---

## 11. Turnos con bloques fijos y autocierre · 🟢 COMPLETA

**Evidencia:** `modules/turnos/` · `components/turnos/turno-guard.tsx`
**Base de datos:** `turnos` (`teamlider NOT NULL`), `cerrar_turnos_expirados`, `pg_cron */15`
**Pruebas:** 24 (16 dominio + 8 aplicación) + 13 de `lib/turnos.ts`

`TurnoGuard` **bloquea la operación** hasta abrir turno. `teamlider` es obligatorio en base, no
solo en el formulario.

---

## 12. Carta digital QR multiidioma · 🟢 COMPLETA (el alta; ver §18 para el tiempo real)

**Evidencia:** `app/qr/[locale]/` · `components/qr/qr-passenger-app.tsx` · `lib/qr/token.ts`
**Base de datos:** `recetas` (servicio + `categoria_menu` + `activo`), `fn_crear_pedido_qr`
**Pruebas:** `qr-actions.test.ts` (8)

**Comportamiento real:** JWT de mesa firmado; menú filtrado por tenant, tipo, actividad y
categoría; validación anti cross-tenant de cada `recetaId`; ruteo por área; alta atómica;
reintento idempotente ante colisión `23505`. Prerenderizado estático en 4 idiomas
(verificado en el `build`).

---

## 13. Motor de alertas (generación y persistencia) · 🟢 COMPLETA

**Evidencia:** `modules/alertas/infrastructure/checks.ts` · `app/api/cron/check-alertas/route.ts`
**Base de datos:** `alertas` (4 CHECK), `pg_cron */5`
**Pruebas:** `check-deduplication.test.ts` (10), `canales-alerta.test.ts` (5)

Los cinco tipos documentados tienen check: tres por cron (`runCheckVencimientos`,
`runCheckDemoraAmex`, `runCheckRequisicionesSinDespachar`) y dos por evento
(`checkStockMinimo` tras `stockOut`, `checkCambioPrecio` tras `createLote`).
La generación, deduplicación, persistencia y autenticación del cron funcionan.

Dos salvedades, ambas en [`18-partial-features.md`](./18-partial-features.md) y
[`19-pending-features.md`](./19-pending-features.md): **la entrega en tiempo real no llega**
(H-C) y **el check de stock mínimo no cubre el consumo por entrega de pedido, merma ni
producción** (A-1).

---

## 14. Auditoría inmutable con hash chain · 🟢 COMPLETA

**Evidencia:** `lib/audit.ts` · `20260503132149_0002_audit_domain_events.sql` ·
`20260520000000_audit_log_qualified_digest.sql`
**Base de datos:** `audit_log` con `audit_log_set_hash` (BEFORE INSERT) y triggers
`prevent_mutation` en UPDATE/DELETE

**Verificado en base:** los triggers existen y bloquean. `auditLog()` nunca interrumpe la
operación principal.

---

## 15. CSP con nonce por petición · 🟢 COMPLETA

**Evidencia:** `lib/security/csp.ts` · `middleware.ts` · `app/layout.tsx`
**Pruebas:** `csp.test.ts` (9), `middleware-matcher.test.ts` (2)
**Verificado en ejecución:** cabecera real capturada con `curl`, con nonce único por respuesta.

---

## 16. Multi-tenancy enforzado en Postgres · 🟢 COMPLETA

**Evidencia:** 48 políticas RLS sobre 22 tablas + 5 triggers `fn_validate_*_tenant`
**Pruebas:** `tenant-isolation.test.ts` + `f001` + `f002` (RLS)
**Verificado:** RLS habilitada en las 25 tablas; 0 políticas `FOR ALL`.

---

## 17. CI/CD y backups · 🟢 COMPLETA

**Evidencia:** `.github/workflows/{ci,deploy,backup}.yml`
**Comportamiento real:** 6 jobs de CI (E2E, lint, typecheck, test, RLS, audit); despliegue tras
gate; backup diario cifrado con GPG AES-256, verificado en tamaño y con heartbeat propio.
Acciones ancladas por SHA.

---

## 18. Internacionalización es/en · 🟢 COMPLETA

**Verificado programáticamente:** 989 claves en cada locale, **paridad exacta**, sin faltantes
ni sobrantes. `fr` y `pt` cubren el namespace `qr`, tal como se documenta.

---

## Resumen

**18 funcionalidades completas.** Todas ellas soportan el núcleo operativo de la sala: se
puede recibir mercancía, componer recetas, producir, tomar pedidos por tres canales,
despacharlos por cuatro pantallas de cocina, entregarlos con descuento atómico de inventario
y auditar todo lo ocurrido, con multi-tenancy real y control de acceso enforzado en la base
de datos.
