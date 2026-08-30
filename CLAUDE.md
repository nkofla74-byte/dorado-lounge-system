# CLAUDE.md

SaaS multi-tenant 24/7 — gestión sala VIP aeroportuaria (GISAT S.A. · Dorado Lounge · El Dorado, Bogotá).  
Scope: 4 KDS por área (cocina caliente, cocina fría, pastelería, AMEX) · Almacén · Admin.  
Código propiedad del desarrollador; cliente adquiere licencia de uso.

Referencia técnica: `ARCHITECTURE.md` (ADRs, ER, algoritmos) · `docs/analisis-v6.docx` (análisis de negocio)

---

## Comandos

```bash
pnpm dev                              # web + socket-server en paralelo
pnpm lint && pnpm typecheck           # obligatorio antes de commit (lo aplica el hook)
pnpm test                             # vitest (todos los paquetes)
pnpm rbac:generate                    # regenera la matriz RBAC en SQL desde permissions.ts
./scripts/sql-harness/run-tests.sh    # pruebas de RLS/RPC contra un Postgres efímero
pnpm --filter apps/web test:e2e       # playwright
pnpm --filter apps/web tsc --noEmit   # type-check sin build
pnpm run reset:test-users             # reconcilia el set canónico de test users (idempotente)
```

DB: migraciones en `supabase/migrations/*.sql`. Las aplica la **integración nativa de Supabase con GitHub** al fusionar en `main`, en orden de nombre (ADR-007; el job `migrate` de `deploy.yml` se retiró el 2026-08-25 porque llevaba desde junio sin aplicar nada). El gate es la protección de rama sobre `main`: lo que gatea el merge gatea la base. **Nunca `supabase start` ni Docker local.**

---

## Stack

| Capa           | Tecnología                                                |
| -------------- | --------------------------------------------------------- |
| Framework      | Next.js 15 App Router · TypeScript strict                 |
| UI             | React · Tailwind CSS · shadcn/ui                          |
| DB / Auth      | Supabase (PostgreSQL 15 + Auth) — Storage aún sin usar¹   |
| Real-time      | Socket.io en Node.js independiente (Render.com Starter)   |
| Validación     | Zod + React Hook Form                                     |
| i18n           | next-intl — dashboards: es/en · QR pasajeros: es/en/fr/pt |
| Testing        | Vitest (unit/integration) · Playwright (E2E)              |
| Observabilidad | Sentry · Axiom · Better Stack                             |
| Deploy         | Vercel (web) · Render.com Starter (socket)                |

¹ No hay ninguna llamada a `supabase.storage` en el repositorio. Las imágenes de plato son
URLs de texto en `recetas.imagen_url`, capturadas a mano. La subida de imágenes es trabajo
pendiente (`docs/project-audit/19-pending-features.md` A-7).

---

## PRINCIPIO RECTOR — INVIOLABLE

**Nada sale de cocina sin receta.** Todo movimiento de inventario está vinculado a una receta. La merma se aplica UNA VEZ en la recepción vía `insumos.merma_default` (el inventario guarda el NETO); el consumo descuenta cantidades netas directas. No existe descuento sin receta. Ante cualquier duda, **parar y preguntar antes de codificar**.

---

## UIs por Rol — Mapa Completo

| Rol                    | Ruta principal     | UI / Funcionalidad                                                                                                                 |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `superuser`            | `/admin/tenants`   | God Mode: CRUD tenants, usuarios, auditoría                                                                                        |
| `admin`                | `/inventario`      | Panel completo: almacén, recetas, costos, KDS monitor, producción, pedidos, analíticos, proveedores, alertas, trazabilidad, turnos |
| `chef_cocina_caliente` | `/cocina-caliente` | KDS Cocina Caliente: cola por área, despacho por ítem con FEFO                                                                     |
| `chef_cocina_fria`     | `/cocina-fria`     | KDS Cocina Fría: cola por área, despacho por ítem con FEFO                                                                         |
| `sous_chef`            | `/cocina-amex`     | Cocina AMEX: cola exclusiva AMEX, trazabilidad completa por orden, timer visible, alertas de demora                                |
| `mesero_amex`          | `/pedidos`         | Tomar pedidos (carta QR + extras pastelería/jefe turno), confirmar entrega                                                         |
| `personal_almacen`     | `/almacen`         | Recepción lotes, alertas stock/vencimiento/precio, historial compras                                                               |
| `personal_pasteleria`  | `/pasteleria`      | Producción pastelería: lotes, costos por unidad, despacho a zonas                                                                  |
| `steward`              | `/produccion`      | Gestión utensilios                                                                                                                 |
| `personal_snack`       | `/snack`           | UI dedicada zona Snack: pedidos por elaboración, descuento al entregar                                                             |
| `personal_buffet`      | `/buffet`          | UI dedicada zona Buffet: pedidos por elaboración, descuento al entregar                                                            |
| anónimo (QR)           | `/qr/[locale]`     | Menú digital self-service: fotos, ingredientes, pedir, sin login                                                                   |

> **Roles inertes.** `chef` (jefe de cocina transversal) y `recepcion` quedaron deprecados en el
> refoco operacional: siguen en el ENUM SQL `user_role` por datos históricos —Postgres no
> permite eliminar un valor— pero **no son asignables ni navegables**, y la ruta `/cocina` que
> tenía `chef` **no existe**. La fuente de verdad de los roles vivos es
> `packages/shared-types/src/enums.ts`. Si hace falta una vista combinada Caliente + Fría para
> un supervisor, es funcionalidad **pendiente**, no existente (ver `docs/project-audit/19-pending-features.md` M-7).

---

## Arquitectura

### Monorepo

```
apps/web/             Next.js — UI + Server Actions
apps/socket-server/   Node.js — Socket.io con JWT auth
packages/shared-types/       Contratos web ↔ socket-server (fuente de verdad)
packages/shared-validation/  Schemas Zod reutilizables
supabase/migrations/         SQL idempotente
scripts/                     Utilidades: reset-test-users.mjs (set canónico idempotente)
```

Cambiar un evento Socket.io → cambiar `packages/shared-types` primero.

### Módulos — Hexagonal + DDD

`apps/web/src/modules/<nombre>/` con estructura rígida:

```
domain/         Sin imports externos ni @supabase/*
application/    Solo importa domain/ y ports/
infrastructure/ Adaptadores Supabase. Implementa ports.
actions.ts      ÚNICA superficie pública (Server Actions)
tests/
```

Regla: `domain ← application ← infrastructure ← actions.ts`. ESLint la enforza.

**Módulos existentes (post-refoco operacional):**

| Estado | Módulo          | Responsabilidad                                                                                                                                                                                                                                       |
| ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | `inventory`     | Stock, lotes, merma en recepción, FEFO                                                                                                                                                                                                                |
| ✅     | `recipes`       | Recetas, ingredientes, secciones                                                                                                                                                                                                                      |
| ✅     | `production`    | Tandas producción, despachos cocina                                                                                                                                                                                                                   |
| ✅     | `orders`        | Pedidos multi-área, estado por ítem, optimistic locking                                                                                                                                                                                               |
| ✅     | `turnos`        | Apertura/cierre turno                                                                                                                                                                                                                                 |
| ✅     | `analytics`     | KPIs, vistas materializadas (solo lectura)                                                                                                                                                                                                            |
| ✅     | `superuser`     | CRUD tenants y usuarios                                                                                                                                                                                                                               |
| ✅     | `cocina-amex`   | KDS exclusivo AMEX: trazabilidad completa, timers, alertas demora                                                                                                                                                                                     |
| ✅     | `proveedores`   | CRUD proveedores, historial compras, vinculación con lotes                                                                                                                                                                                            |
| ✅     | `alertas`       | Motor de alertas: stock mínimo, vencimiento, cambio precio, demora                                                                                                                                                                                    |
| ✅     | `costos`        | Costo en tiempo real por receta (ingredientes × precio lote actual)                                                                                                                                                                                   |
| ✅     | `requisiciones` | Requisiciones de insumos cocina → almacén; estados con optimistic locking + idempotencia, vinculadas al turno activo. Surface embebida en `/almacen`, `/cocina-caliente`, `/cocina-fria`, `/inventario`. Canal `ALMACEN`, evento `REQUISICION_ESTADO` |

`analytics` es solo-lectura — proyecta vistas materializadas, nunca escribe.

> **No son módulos hexagonales** (pero existen como libs auxiliares):
>
> - `lib/auth/assertCan.ts` + `lib/auth/permissions.ts` — RBAC (matriz de permisos).
> - `lib/socket/` (`client.ts`, `socket-provider.tsx`, `use-socket.ts`, `emit-event.ts`) — integración Socket.io client.
> - `lib/audit.ts` — wrapper de inserción en `audit_log` (el hash chain vive en Postgres). **No es un módulo hexagonal.**
> - `lib/rate-limit.ts` — buckets Upstash (login/cron/heartbeat/gdpr).

---

## Inventario

### Merma — en recepción (modelo F3, 2026-05-30)

`modules/inventory/domain/merma.ts`: `aplicarMermaRecepcion(comprado, coef) = comprado × (1 - coef)` y `costoUnitarioNeto = costo / (1 - coef)` (preserva el valor total del lote). La fuente autoritativa del coeficiente es `insumos.merma_default`; `receta_ingredientes.merma_coeficiente` es histórico. Coverage 90%+ obligatorio.

### Descuento FEFO — solo en SQL

Toda deducción de stock → RPC `fn_descontar_insumo_fefo` (Postgres). Atómico con `FOR UPDATE`. **No reimplementar en TypeScript.**

Idempotente por `idempotency_key`. Obligatoria en: Stock Out, despacho, tickets.

### Capas y zonas

- `capa_1`: materia prima bodega → `capa_2`: producción interna
- `receta_produccion`: Capa 1→2 · `receta_servicio`: Capa 1/2 → zona de despacho

| Zona           | Cuándo descuenta                                                   |
| -------------- | ------------------------------------------------------------------ |
| Amex           | Al confirmar entrega del pedido                                    |
| Snack / Buffet | Zonas de origen de pedido — descuento ocurre al entregar el pedido |

---

## Base de datos

**Convenciones (no negociables):**

- IDs: `uuid` · `gen_random_uuid()`
- Todas las tablas: `tenant_id uuid NOT NULL` + RLS habilitada
- Multi-tenancy enforza en **Postgres**, no en la app
- Soft delete: `deleted_at` nullable (excepto `audit_log` y `domain_events` — inmutables)
- Monetario: `numeric(14,2)` COP — nunca `float`
- Cantidades: `numeric(12,4)` · Costo unitario: `numeric(14,4)` · Timestamps: `timestamptz` UTC
- Migraciones idempotentes — nunca `DROP COLUMN`/`DROP TABLE` en un paso sin gate del dueño

**Tablas existentes:**

`tenants` · `users` · `insumos` · `lotes` (con `proveedor_id` FK, `costo_unitario numeric(14,4)`) · `recetas` · `receta_ingredientes` · `tandas_produccion` · `despachos` · `movimientos_inventario` · `pedidos` · `pedido_items` (con `estado`, `area_produccion`, timestamps/actores) · `pedido_eventos` · `pedido_item_eventos` (log append-only por ítem) · `mermas` · `turnos` (con `teamlider`) · `proveedores` · `alertas` · `requisiciones` · `requisicion_items` · `requisicion_eventos` (log append-only) · `domain_events` · `audit_log` · `operaciones_idempotentes` · `tenant_codigo_counters` (contadores SKU/lote por tenant, solo RPC) · `rbac_permisos` (matriz generada, 144 filas, solo RPC)

Son **25 tablas**. Las tres marcadas «solo RPC» tienen RLS habilitada y **cero políticas**: son
inaccesibles salvo desde funciones `SECURITY DEFINER`. Es intencional.

> `costos` no es tabla — es la RPC `fn_costo_receta(p_tenant_id, p_receta_id)` que calcula en tiempo real desde `lotes` (FEFO-next por costo). Validación de tenant vía `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` (migración 0004).

Antes de crear una tabla: verificar la lista y el ER en `ARCHITECTURE.md §8`.

`domain_events` y `audit_log` tienen triggers que bloquean UPDATE/DELETE. `audit_log` tiene hash chain SHA-256 — no mutarlas desde código.

**Pedidos — escritura SOLO por RPC.** Desde la remediación 2026-08-22, `authenticated` no tiene INSERT ni UPDATE sobre `pedidos`, `pedido_items`, `pedido_eventos` ni `pedido_item_eventos`. Toda mutación pasa por RPCs `SECURITY DEFINER` que derivan tenant, rol y usuario de `auth.jwt()` —nunca de parámetros—, autorizan contra `rbac_permisos` y trabajan en una transacción con `FOR UPDATE`:

| RPC                          | Uso                                                |
| ---------------------------- | -------------------------------------------------- |
| `fn_crear_pedido`            | Alta interna (exige `orders:create`)               |
| `fn_crear_pedido_qr`         | Alta desde el QR de pasajero (solo `service_role`) |
| `fn_pedido_transicion`       | Transiciones que no mueven inventario              |
| `fn_entregar_pedido`         | Entrega: descuento FEFO + transición, atómico      |
| `fn_pedido_asignar_cocinero` | Asignación de responsable                          |
| `fn_transicionar_item`       | Estado por ítem + estado agregado del pedido       |

Transición AMEX completa: `creado → recibido_cocina → en_preparacion → despachado → entregado`. Estado por ítem: `pendiente → en_preparacion → listo` (con recall posible). El optimistic locking por `version` lo aplica la RPC, no el cliente.

**Autorización en dos capas.** `assertCan()` en la Server Action y `fn_puede()` en Postgres. La tabla `rbac_permisos` se **genera** desde `lib/auth/permissions.ts` con `pnpm rbac:generate`; una prueba de vitest falla si alguien cambia una sin regenerar la otra. Nunca escribir listas de roles a mano dentro de una política RLS.

**Sin borrado físico.** `DELETE` está revocado para `anon`/`authenticated` en las 20 tablas operativas: el modelo usa `deleted_at`.

---

## Real-time

```
SuperUser ─── Admin
               │
  ┌────────────┼────────────┐────────────┐
COCINA_FRIA COCINA_CALIENTE COCINA_AMEX PASTELERÍA  ← nodos de producción
                                │
                    AMEX ─ SNACK ─ BUFFET  ← zonas de origen (no se hablan entre sí)
```

`CHANNELS` y `CHANNEL_ACL` en `packages/shared-types/src/socket-events.ts` son **autoritativos**. Canal nuevo → verificar topología y actualizar `CHANNEL_ACL`.

Eventos clave (literales `type` en `socket-events.ts`): `PEDIDO_CREADO`, `PEDIDO_ESTADO`, `PEDIDO_COCINERO`, `ITEM_ESTADO`, `ALERTA`, `REQUISICION_ESTADO`, `TURNO_EVENTO`.

Canal sin permiso → desconexión inmediata. Se trata como evento de seguridad, no como warning:
el socket-server lo registra en su logger estructurado y lo eleva a Sentry
(`Sentry.captureMessage('channel_acl_violation', { level: 'warning' })`). **No** escribe en
`audit_log` — el socket-server no tiene acceso a la base. Llevarlo a `audit_log` es trabajo
pendiente, no comportamiento actual.

**Persistencia primero, broadcast después.** Si Socket.io falla, el evento queda en DB para reconciliación.

---

## Turnos y Sesión

- Cada sesión de usuario = una entrada en `turnos`.
- Columnas reales de `turnos`: `responsable_id` (FK a `users`, de donde salen usuario y rol),
  `teamlider` (`NOT NULL`, sin default), `bloque`, `iniciado_at`, `cerrado_at`, `cierre_motivo`.
- Toda producción, pedido y movimiento de inventario está vinculado al turno activo.
- Admin puede filtrar cualquier reporte por turno, responsable, nodo, período.
- `teamlider` es un campo obligatorio al abrir turno — no tiene valor por defecto.

---

## Alertas

Disparadores:

- Stock < umbral mínimo → notificar Admin + cocina responsable.
- Vencimiento en N días → notificar Admin + Almacén.
- Cambio de precio > X% vs. último lote → notificar Admin.
- Demora pedido AMEX > umbral → notificar Chef AMEX + Mesero.

Las alertas se almacenan en tabla `alertas` y se transmiten vía Socket.io. Solo notificaciones in-app.

**Cron de checks:** `pg_cron` en Supabase ejecuta cada 5 min (`*/5 * * * *`) un `net.http_post` a `/api/cron/check-alertas`, autenticado con `Bearer ${CRON_SECRET}`. El endpoint corre `runCheckVencimientos` + `runCheckDemoraAmex` por cada tenant activo. Existe también un disparo diario vía Vercel Cron (`0 3 * * *`) como fallback — la fuente real es pg_cron. Configuración post-deploy: `ALTER DATABASE postgres SET app.cron_base_url`/`app.cron_secret` en Supabase (ver migración `20260516000003_pgcron_check_alertas.sql`).

---

## Patrones de código

**Server Actions:** `'use server'` + Zod + `assertCan(perm)` + `auditLog(...)`, sin excepción.

**Result type** (`lib/result.ts`): `{ ok: true; value: T } | { ok: false; error: AppErrorPayload }`. Sin `try/catch` ad-hoc en dominio.

**Lecturas:** Supabase client directo (server o client según contexto).

**i18n:** Usar `useTranslations` (next-intl) en todos los componentes de UI. Las claves van en `messages/es.json` y `messages/en.json`. Nunca hardcodear strings de UI.

**Código:** inglés. **UI strings:** i18n (es/en). **Commits:** español, Conventional Commits. **Ramas:** `feature/<modulo>`.

---

## Variables de entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # solo lib/supabase/admin.ts — nunca NEXT_PUBLIC_*

# Real-time
NEXT_PUBLIC_SOCKET_URL=

# Auth QR
JWT_PASSENGER_SECRET=               # tokens QR anónimos de mesa (12h TTL — ver lib/qr/token.ts)

# Observabilidad
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
AXIOM_TOKEN=
AXIOM_DATASET=
BETTERSTACK_SOURCE_TOKEN=

# Seguridad
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Rate limiting (Upstash Redis) — fail-open si no están seteadas
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## Analytics — KPIs operacionales

Solo lectura vía `fn_costo_receta` y las vistas del módulo `analytics`. Nunca escribe.

**Estado real (auditoría 2026-08-30):** la vista materializada `mv_consumo_vs_produccion_turno`
tiene dimensiones **turno × insumo**, y los filtros implementados son **turno, desde y hasta**.
Las dimensiones **nodo** y **responsable** no existen todavía: añadirlas exige rehacer la vista,
no solo la UI (pendiente A-5).

> ⚫ **La pantalla `/analytics` no funciona hoy.** La vista se creó `WITH (security_invoker = true)`
> y la misma migración revocó a `authenticated` el `SELECT` sobre la vista materializada de la
> que depende, así que devuelve `permission denied`; el camino cross-tenant del superuser
> devuelve cero filas; y no hay refresco programado en `pg_cron`.
> Diagnóstico reproducido con SQL y corrección propuesta en
> `docs/project-audit/20-technical-debt.md` (H-A, H-B, H-D).

---

## Reglas operativas

1. **Inventario/recetas:** releer Principio Rector y `ARCHITECTURE.md §9` antes de tocar.
2. **Descuentos de stock:** siempre vía `fn_descontar_insumo_fefo`. No reimplementar en TypeScript.
3. **Módulo nuevo:** hexagonal estricto — `domain → application → infrastructure → actions.ts`.
4. **Canal Socket.io nuevo:** verificar topología y actualizar `CHANNEL_ACL` en shared-types.
5. **Tabla nueva:** verificar lista de módulos y ER en `ARCHITECTURE.md §8`.
6. **Idempotencia:** Stock Out, merma, despacho y tandas requieren `idempotency_key` siempre —
   está enforzado con `UNIQUE` en base. Ojo: la **cola offline** hoy solo existe para el QR del
   pasajero; el personal no puede operar sin red (pendiente M-1).
7. **UI strings:** nunca hardcoded — siempre vía next-intl. Paridad `es`/`en` verificada: 989
   claves cada uno. Única infracción viva: `components/qr/offline-banner.tsx` lleva un objeto
   `TEXTS` con los 4 idiomas a mano (pendiente B-5); no imitarlo.
8. **Teamlider:** campo obligatorio al abrir turno; vinculado a todos los registros del turno.
9. **Permiso nuevo o cambio de rol:** editar `lib/auth/permissions.ts` y ejecutar `pnpm rbac:generate`. Nunca tocar el bloque generado de `20260822000002_rbac_matriz.sql` a mano.
10. **Escritura de pedidos:** siempre vía RPC. Añadir un `UPDATE` directo sobre `pedidos` desde la app fallará por privilegios.
11. **Migración que cambia la firma de una función:** `CREATE OR REPLACE` con parámetros distintos crea un _overload_ y deja el viejo huérfano. Hacer `DROP FUNCTION` explícito de la firma anterior y recrear los llamadores.
12. **Precedencia:** `CLAUDE.md` > `ARCHITECTURE.md` > `docs/analisis-v6.docx`. Contradicción → preguntar.
13. **Stack y decisiones congeladas:** no sugerir cambios sin pedido explícito.

---

## Diseño — stack Apple HIG

`.claude/skills/` incorpora 10 skills de diseño. **`dorado-design-system` es la
autoridad**: fija la precedencia entre las demás y traduce sus reglas nativas
(SwiftUI, SF Symbols, UIKit) a este stack. Léela antes de tocar cualquier UI.

Dos reglas que se rompen a menudo: **SF Symbols no puede embeberse en una web**
—es una fuente con licencia de Apple; aquí se usa `lucide-react`— y en KDS y
almacén el objetivo táctil mínimo es **56 px**, no los 44 pt del HIG, porque se
opera con guantes.

Precedencia: `CLAUDE.md` > `dorado-design-system` > skills `apple-*`. Detalle e
instalación en `docs/skills/`.

---

## Auditoría y remediación

**`docs/PROJECT_STATUS.md` es el estado actual del proyecto.** Auditoría exhaustiva del
2026-08-30 verificada por ejecución —no por lectura de documentación—: 567 pruebas, build,
las 80 migraciones sobre un Postgres limpio y las 12 suites de RLS. Su detalle vive en
`docs/project-audit/` (24 documentos); la evidencia reproducible, en `23-evidence-index.md`;
la deuda priorizada, en `20-technical-debt.md`.

**Cinco defectos funcionales abiertos** (ninguno de seguridad): `/analytics` devuelve
`permission denied` (H-A) y cero filas para el superuser (H-B); la vista materializada no
tiene refresco programado (H-D); `AlertasBell` escucha eventos sin unirse a ningún canal, así
que el tiempo real de alertas no llega (H-C); y el alta de pedidos por QR emite a un solo
canal (H-E). **Léelos antes de tocar analytics, alertas o el QR.**

`docs/remediacion/` — informe de la auditoría forense 2026-08-22 y su remediación:
roadmap, tracker por hallazgo, cambios de seguridad (incluye **acciones de
configuración pendientes fuera del repositorio**), planes de migración, pruebas y
rollback, y los ADR. Empezar por `REMEDIATION_TRACKER.md`.

---

_v6.2 — 2026-08-30 · Alineado con el código tras la auditoría exhaustiva: rol `chef` y ruta `/cocina` retirados de la tabla de UIs, TTL real del token QR, alcance real de analytics, Storage sin usar, columnas reales de `turnos`, `rbac_permisos` en la lista de tablas. Estado del proyecto: `docs/PROJECT_STATUS.md`_

_v6.1 — Agosto 2026 · Remediación forense: autorización en base, escritura de pedidos por RPC, matriz RBAC generada_
