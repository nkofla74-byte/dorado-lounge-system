# CLAUDE.md

SaaS multi-tenant 24/7 — gestión sala VIP aeroportuaria (GISAT S.A. · Dorado Lounge · El Dorado, Bogotá).  
Scope: 4 KDS por área (cocina caliente, cocina fría, pastelería, AMEX) · Almacén · Admin.  
Código propiedad del desarrollador; cliente adquiere licencia de uso.

Referencia técnica: `ARCHITECTURE.md` (ADRs, ER, algoritmos) · `docs/analisis-v6.docx` (análisis de negocio)

---

## Comandos

```bash
pnpm dev                              # web + socket-server en paralelo
pnpm lint && pnpm typecheck           # obligatorio antes de commit
pnpm test                             # vitest (todos los paquetes)
pnpm --filter apps/web test:e2e       # playwright
pnpm --filter apps/web tsc --noEmit   # type-check sin build
pnpm run reset:test-users             # reconcilia el set canónico de test users (idempotente)
```

DB: migraciones en `supabase/migrations/*.sql`, vía CI (`supabase db push`). **Nunca `supabase start` ni Docker local.**

---

## Stack

| Capa           | Tecnología                                                |
| -------------- | --------------------------------------------------------- |
| Framework      | Next.js 15 App Router · TypeScript strict                 |
| UI             | React · Tailwind CSS · shadcn/ui                          |
| DB / Auth      | Supabase (PostgreSQL 15 + Auth + Storage)                 |
| Real-time      | Socket.io en Node.js independiente (Render.com Starter)   |
| Validación     | Zod + React Hook Form                                     |
| i18n           | next-intl — dashboards: es/en · QR pasajeros: es/en/fr/pt |
| Testing        | Vitest (unit/integration) · Playwright (E2E)              |
| Observabilidad | Sentry · Axiom · Better Stack                             |
| Deploy         | Vercel (web) · Render.com Starter (socket)                |

---

## PRINCIPIO RECTOR — INVIOLABLE

**Nada sale de cocina sin receta.** Todo movimiento de inventario está vinculado a una receta. La merma se aplica UNA VEZ en la recepción vía `insumos.merma_default` (el inventario guarda el NETO); el consumo descuenta cantidades netas directas. No existe descuento sin receta. Ante cualquier duda, **parar y preguntar antes de codificar**.

---

## UIs por Rol — Mapa Completo

| Rol                    | Ruta principal      | UI / Funcionalidad                                                                                           |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `superuser`            | `/admin/tenants`    | God Mode: CRUD tenants, usuarios, auditoría                                                                  |
| `admin`                | `/inventario`       | Panel completo: almacén, recetas, costos, KDS monitor, producción, pedidos, analíticos, proveedores, alertas |
| `chef_cocina_caliente` | `/cocina-caliente`  | KDS Cocina Caliente: cola por área, despacho por ítem con FEFO                                               |
| `chef_cocina_fria`     | `/cocina-fria`      | KDS Cocina Fría: cola por área, despacho por ítem con FEFO                                                   |
| `sous_chef`            | `/cocina-amex`      | Cocina AMEX: cola exclusiva AMEX, trazabilidad completa por orden, timer visible, alertas de demora          |
| `mesero_amex`          | `/pedidos`          | Tomar pedidos (carta QR + extras pastelería/jefe turno), confirmar entrega                                   |
| `personal_almacen`     | `/almacen`          | Recepción lotes, alertas stock/vencimiento/precio, historial compras                                         |
| `personal_pasteleria`  | `/pasteleria`       | Producción pastelería: lotes, costos por unidad, despacho a zonas                                            |
| `steward`              | `/produccion`       | Gestión utensilios                                                                                           |
| `personal_snack`       | `/pedidos` (origen) | Rol de zona de origen — UI K2 pendiente                                                                      |
| `personal_buffet`      | `/pedidos` (origen) | Rol de zona de origen — UI K2 pendiente                                                                      |
| anónimo (QR)           | `/qr/[locale]`      | Menú digital self-service: fotos, ingredientes, pedir, sin login                                             |

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

| Estado | Módulo          | Responsabilidad                                                     |
| ------ | --------------- | ------------------------------------------------------------------- |
| ✅     | `inventory`     | Stock, lotes, merma en recepción, FEFO                              |
| ✅     | `recipes`       | Recetas, ingredientes, secciones                                    |
| ✅     | `production`    | Tandas producción, despachos cocina                                 |
| ✅     | `orders`        | Pedidos multi-área, estado por ítem, optimistic locking             |
| ✅     | `turnos`        | Apertura/cierre turno                                               |
| ✅     | `analytics`     | KPIs, vistas materializadas (solo lectura)                          |
| ✅     | `feature-flags` | Flags por tenant                                                    |
| ✅     | `superuser`     | CRUD tenants y usuarios                                             |
| ✅     | `cocina-amex`   | KDS exclusivo AMEX: trazabilidad completa, timers, alertas demora   |
| ✅     | `proveedores`   | CRUD proveedores, historial compras, vinculación con lotes          |
| ✅     | `alertas`       | Motor de alertas: stock mínimo, vencimiento, cambio precio, demora  |
| ✅     | `costos`        | Costo en tiempo real por receta (ingredientes × precio lote actual) |

`analytics` es solo-lectura — proyecta vistas materializadas, nunca escribe.

> **No son módulos hexagonales** (pero existen como libs auxiliares):
>
> - `lib/auth/assertCan.ts` + `lib/auth/permissions.ts` — RBAC (matriz de permisos).
> - `lib/socket/use-realtime.ts` — integración Socket.io client.
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

`tenants` · `users` · `insumos` · `lotes` (con `proveedor_id` FK, `costo_unitario numeric(14,4)`) · `recetas` · `receta_ingredientes` · `tandas_produccion` · `despachos` · `movimientos_inventario` · `pedidos` · `pedido_items` (con `estado`, `area_produccion`, timestamps/actores) · `pedido_eventos` · `pedido_item_eventos` (log append-only por ítem) · `mermas` · `turnos` (con `teamlider`) · `proveedores` · `alertas` · `domain_events` · `audit_log` · `feature_flags` · `operaciones_idempotentes`

> `costos` no es tabla — es la RPC `fn_costo_receta(p_tenant_id, p_receta_id)` que calcula en tiempo real desde `lotes` (FEFO-next por costo). Validación de tenant vía `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` (migración 0004).

Antes de crear una tabla: verificar la lista y el ER en `ARCHITECTURE.md §8`.

`domain_events` y `audit_log` tienen triggers que bloquean UPDATE/DELETE. `audit_log` tiene hash chain SHA-256 — no mutarlas desde código.

**Pedidos — optimistic locking:** siempre `.eq('version', pedido.version)`. Transición AMEX completa: `creado → recibido_cocina → en_preparacion → despachado → entregado`. Estado por ítem: `pendiente → en_preparacion → listo` (con recall posible).

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

Eventos clave: `PEDIDO_ESTADO`, `ITEM_ESTADO`, `ALERTA_NUEVA`, `PRODUCCION_UPDATE`.

Canal sin permiso → desconexión inmediata + `audit_log` (evento de seguridad, no warning).

**Persistencia primero, broadcast después.** Si Socket.io falla, el evento queda en DB para reconciliación.

---

## Turnos y Sesión

- Cada sesión de usuario = una entrada en `turnos`.
- Campos requeridos: `usuario`, `rol`, `teamlider`, `login_time`, `logout_time`.
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
JWT_PASSENGER_SECRET=               # tokens QR anónimos de mesa (4h TTL)

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

Métricas de consumo por turno, nodo y responsable. Solo lectura via `fn_costo_receta` y vistas del módulo `analytics`. Filtros obligatorios: turno, nodo, responsable, período.

---

## Reglas operativas

1. **Inventario/recetas:** releer Principio Rector y `ARCHITECTURE.md §9` antes de tocar.
2. **Descuentos de stock:** siempre vía `fn_descontar_insumo_fefo`. No reimplementar en TypeScript.
3. **Módulo nuevo:** hexagonal estricto — `domain → application → infrastructure → actions.ts`.
4. **Canal Socket.io nuevo:** verificar topología y actualizar `CHANNEL_ACL` en shared-types.
5. **Tabla nueva:** verificar lista de módulos y ER en `ARCHITECTURE.md §8`.
6. **Idempotencia offline:** Stock Out, despacho y tickets requieren `idempotency_key` siempre.
7. **UI strings:** nunca hardcoded — siempre vía next-intl.
8. **Teamlider:** campo obligatorio al abrir turno; vinculado a todos los registros del turno.
9. **Precedencia:** `CLAUDE.md` > `ARCHITECTURE.md` > `docs/analisis-v6.docx`. Contradicción → preguntar.
10. **Stack y decisiones congeladas:** no sugerir cambios sin pedido explícito.

---

_v6.0 — Junio 2026 · Refoco operacional: 4 KDS por área, despacho por ítem, merma en recepción, unidades g/ml/unidad_
