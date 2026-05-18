# CLAUDE.md

SaaS multi-tenant 24/7 — gestión sala VIP aeroportuaria (GISAT S.A. · Dorado Lounge · El Dorado, Bogotá).  
Scope: Recepción · Cocina General · Cocina AMEX · Pastelería · Snack · Buffet · Almacén · Admin.  
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
pnpm reset:test-users                 # reconcilia el set canónico de test users (idempotente)
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

**Nada sale de cocina sin receta.** Todo movimiento de inventario está vinculado a una receta con `merma_coeficiente`. No existe descuento sin receta. Ante cualquier duda, **parar y preguntar antes de codificar**.

---

## UIs por Rol — Mapa Completo

| Rol                   | Ruta principal   | UI / Funcionalidad                                                                                           |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `superuser`           | `/admin/tenants` | God Mode: CRUD tenants, usuarios, auditoría                                                                  |
| `admin`               | `/inventario`    | Panel completo: almacén, recetas, costos, KDS monitor, producción, pedidos, analíticos, proveedores, alertas |
| `chef`                | `/cocina`        | Cocina General: cola FIFO Snack+Buffet+Sala, despacho con descuento FEFO                                     |
| `sous_chef`           | `/cocina-amex`   | Cocina AMEX: cola exclusiva AMEX, trazabilidad completa por orden, timer visible, alertas de demora          |
| `mesero_amex`         | `/pedidos`       | Tomar pedidos (misma carta QR + extras pastelería/jefe turno), confirmar entrega                             |
| `recepcion`           | `/afluencia`     | Registro ingresos, control turno (quién abrió/cerró, teamlider, horarios)                                    |
| `personal_snack`      | `/snack`         | Notificar cocina, pedir preparaciones/menaje, ver pendientes                                                 |
| `personal_buffet`     | `/buffet`        | Igual Snack pero zona buffet; stock local visible                                                            |
| `personal_almacen`    | `/almacen`       | Recepción lotes, alertas stock/vencimiento/precio, historial compras                                         |
| `personal_pasteleria` | `/pasteleria`    | Producción pastelería: lotes, costos por unidad, despacho a zonas                                            |
| `steward`             | `/produccion`    | Gestión utensilios                                                                                           |
| anónimo (QR)          | `/qr/[locale]`   | Menú digital self-service: fotos, ingredientes, pedir, sin login                                             |

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

**Módulos existentes:**

| Estado | Módulo          | Responsabilidad                                                     |
| ------ | --------------- | ------------------------------------------------------------------- |
| ✅     | `inventory`     | Stock, lotes, merma, FEFO                                           |
| ✅     | `recipes`       | Recetas, ingredientes, secciones                                    |
| ✅     | `production`    | Tandas producción, despachos cocina                                 |
| ✅     | `orders`        | Pedidos AMEX, optimistic locking, estado                            |
| ✅     | `buffet`        | Stock Out Buffet, tickets por turno                                 |
| ✅     | `snack`         | Stock Out Snack                                                     |
| ✅     | `afluencia`     | Registro ingresos por turno                                         |
| ✅     | `chat`          | Mensajería inter-zona con ACL                                       |
| ✅     | `flights`       | Tablero vuelos El Dorado (AviationStack)                            |
| ✅     | `turnos`        | Apertura/cierre turno                                               |
| ✅     | `analytics`     | KPIs, vistas materializadas (solo lectura)                          |
| ✅     | `feature-flags` | Flags por tenant                                                    |
| ✅     | `superuser`     | CRUD tenants y usuarios                                             |
| ✅     | `audit`         | Hash chain SHA-256, audit_log                                       |
| ✅     | `cocina_amex`   | KDS exclusivo AMEX: trazabilidad completa, timers, alertas demora   |
| ✅     | `proveedores`   | CRUD proveedores, historial compras, vinculación con lotes          |
| ✅     | `alertas`       | Motor de alertas: stock mínimo, vencimiento, cambio precio, demora  |
| ✅     | `costos`        | Costo en tiempo real por receta (ingredientes × precio lote actual) |

`analytics` es solo-lectura — proyecta vistas materializadas, nunca escribe.

> **No son módulos hexagonales** (pero existen como libs auxiliares):
>
> - `lib/auth/assertCan.ts` + `lib/auth/permissions.ts` — RBAC (matriz de permisos).
> - `lib/socket/use-realtime.ts` — integración Socket.io client.
> - `lib/audit.ts` — wrapper de inserción en `audit_log` (el hash chain vive en Postgres).
> - `lib/rate-limit.ts` — buckets Upstash (login/cron/heartbeat/gdpr).

---

## Inventario

### Merma

`modules/inventory/domain/merma.ts`: `bruto = requerida / (1 - coeficiente)` — 4 decimales. Coverage 90%+ obligatorio.

### Descuento FEFO — solo en SQL

Toda deducción de stock → RPC `fn_descontar_insumo_fefo` (Postgres). Atómico con `FOR UPDATE`. **No reimplementar en TypeScript.**

Idempotente por `idempotency_key`. Obligatoria en: Stock Out, despacho, tickets.

### Capas y zonas

- `capa_1`: materia prima bodega → `capa_2`: producción interna
- `receta_produccion`: Capa 1→2 · `receta_servicio`: Capa 1/2 → zona de despacho

| Zona   | Cuándo descuenta                          |
| ------ | ----------------------------------------- |
| Amex   | Al confirmar entrega del pedido           |
| Snack  | Al despachar desde cocina                 |
| Buffet | Al despachar lote; conciliación al cierre |

---

## Base de datos

**Convenciones (no negociables):**

- IDs: `uuid` · `gen_random_uuid()`
- Todas las tablas: `tenant_id uuid NOT NULL` + RLS habilitada
- Multi-tenancy enforza en **Postgres**, no en la app
- Soft delete: `deleted_at` nullable (excepto `audit_log` y `domain_events` — inmutables)
- Monetario: `numeric(14,2)` COP — nunca `float`
- Cantidades: `numeric(12,4)` · Timestamps: `timestamptz` UTC
- Migraciones idempotentes — nunca `DROP COLUMN`/`DROP TABLE` en un paso

**Tablas existentes:**

`tenants` · `users` · `insumos` · `lotes` (con `proveedor_id` FK) · `recetas` · `receta_ingredientes` · `tandas_produccion` · `despachos` · `movimientos_inventario` · `pedidos` · `pedido_items` · `pedido_eventos` (trazabilidad AMEX) · `buffet_tickets_turno` · `mermas` · `mensajes_chat` · `afluencia_ingresos` · `turnos` (con `teamlider`) · `proveedores` · `alertas` · `domain_events` · `audit_log` · `feature_flags` · `operaciones_idempotentes`

> `costos` no es tabla — es la RPC `fn_costo_receta(p_tenant_id, p_receta_id)` que calcula en tiempo real desde `lotes` (FEFO-next por costo). Validación de tenant vía `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` (migración 0004).

Antes de crear una tabla: verificar la lista y el ER en `ARCHITECTURE.md §8`.

`domain_events` y `audit_log` tienen triggers que bloquean UPDATE/DELETE. `audit_log` tiene hash chain SHA-256 — no mutarlas desde código.

**Pedidos — optimistic locking:** siempre `.eq('version', pedido.version)`. Transición AMEX completa: `creado → recibido_cocina → en_preparacion → despachado → entregado`.

---

## Real-time

```
SuperUser ─── Admin
               │
     ┌─────────┤─────────┐
  COCINA    COCINA_AMEX  PASTELERÍA  ← nodos de producción
     │
  AMEX ─ SNACK ─ BUFFET  ← zonas de despacho (no se hablan entre sí)
```

`CHANNELS` y `CHANNEL_ACL` en `packages/shared-types/src/socket-events.ts` son **autoritativos**. Canal nuevo → verificar topología y actualizar `CHANNEL_ACL`.

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

# Vuelos
FLIGHTS_API_KEY=
FLIGHTS_API_URL=
```

---

## Analytics — KPIs

- `cogs_per_passenger` = consumo real (recetas + merma) / pasajeros — eficiencia operativa
- `cash_outflow_per_passenger` = compras del período / pasajeros — flujo de caja

Solo lectura de vistas materializadas. Filtros obligatorios: turno, nodo, responsable, período.

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

_v5.2 — Mayo 2026 · Hardening pre-deploy: Next.js 15 (0 CVEs), rate limit Upstash, auditLog completo en alertas, coverage v8 wired (75% global, 100% en merma)_
