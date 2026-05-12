# CLAUDE.md

SaaS multi-tenant 24/7 — gestión sala VIP aeroportuaria (GISAT S.A. · Dorado Lounge · El Dorado, Bogotá). Código propiedad del desarrollador; cliente adquiere licencia.

Referencia técnica completa: `ARCHITECTURE.md` (ADRs, ER, algoritmos) · `docs/analisis-v6.docx` (análisis de negocio)

---

## Comandos

```bash
pnpm dev                              # web + socket-server en paralelo
pnpm lint && pnpm typecheck           # obligatorio antes de commit
pnpm test                             # vitest (todos los paquetes)
pnpm --filter apps/web test:e2e       # playwright
pnpm --filter apps/web tsc --noEmit   # type-check sin build
pnpm --filter apps/socket-server dev  # socket server en dev
```

DB: migraciones en `supabase/migrations/*.sql`, se aplican vía CI (`supabase db push`). **Nunca `supabase start` ni Docker local.**

Seed de desarrollo: `supabase/seed.sql` (1 tenant, 7 usuarios cubriendo roles operativos, 28 lotes FEFO, recetas, pedidos KDS). Password de todos los usuarios: `DoradoTest2024!`. **Solo correr en dev/staging, NUNCA en producción.**

---

## Stack

| Capa           | Tecnología                                              |
| -------------- | ------------------------------------------------------- |
| Framework      | Next.js 14 App Router · TypeScript strict               |
| UI             | React · Tailwind CSS · shadcn/ui                        |
| DB / Auth      | Supabase (PostgreSQL 15 + Auth + Storage)               |
| Real-time      | Socket.io en Node.js independiente (Render.com Starter) |
| Validación     | Zod + React Hook Form                                   |
| i18n QR        | next-intl (`/qr/[locale]` — es/en/fr/pt)                |
| Testing        | Vitest (unit/integration) · Playwright (E2E)            |
| Observabilidad | Sentry · Axiom · Better Stack                           |
| Deploy         | Vercel (web) · Render.com Starter (socket)              |

---

## PRINCIPIO RECTOR — INVIOLABLE

**Nada sale de cocina sin receta.** Todo movimiento de inventario está vinculado a una receta con `merma_coeficiente`. No existe descuento sin receta. Ante cualquier duda, **parar y preguntar antes de codificar**.

---

## Arquitectura

### Monorepo

```
apps/web/             Next.js — UI + Server Actions
apps/socket-server/   Node.js — Socket.io con JWT auth
packages/shared-types/       Contratos entre web y socket-server (fuente de verdad)
packages/shared-validation/  Schemas Zod reutilizables
supabase/migrations/         SQL idempotente
supabase/seed.sql            Datos de desarrollo (1 tenant, 7 usuarios, 28 lotes, recetas, KDS)
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

Regla: `domain ← application ← infrastructure ← actions.ts`. ESLint la enforza — si falla el linter en `domain/`, el diseño está mal.

Fuera del módulo: importar solo de `actions.ts`.

**Módulos existentes:**

- Core: `inventory` · `recipes` · `production`
- Supporting: `orders` · `buffet` · `snack` · `afluencia` · `chat`
- Generic: `superuser` · `turnos` · `identity` · `rbac` · `realtime` · `audit` · `analytics`
- Sprint 6: `flights` (puerto hexagonal, proveedor TBD)

`analytics` es solo-lectura — proyecta vistas materializadas, nunca escribe.

---

## Inventario

### Merma

Función pura en `modules/inventory/domain/merma.ts`. Fórmula: `bruto = requerida / (1 - coeficiente)` redondeado a 4 decimales. Coverage 90%+ obligatorio — si sus tests fallan, el deploy se bloquea.

### Descuento FEFO — solo en SQL

Toda deducción de stock pasa por el RPC `fn_descontar_insumo_fefo` (Postgres). Atómico con `FOR UPDATE`. **No reimplementar en TypeScript.**

Idempotente por `idempotency_key`: si la key ya existe, devuelve el resultado previo sin efectos. Obligatoria en Stock Out, despacho y tickets (prevención doble submit offline).

### Capas y zonas

- `capa_1`: materia prima bodega → `capa_2`: producción interna
- `receta_produccion`: Capa 1 → Capa 2 · `receta_servicio`: Capa 1/2 → zona de despacho

| Zona   | Cuándo descuenta                                                    |
| ------ | ------------------------------------------------------------------- |
| Amex   | Al confirmar entrega del pedido                                     |
| Snack  | Al despachar desde cocina                                           |
| Buffet | Al despachar lote; conciliación al cierre (`1 ticket = 1 servicio`) |

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

`tenants` · `users` · `insumos` · `lotes` · `recetas` · `receta_ingredientes` · `tandas_produccion` · `despachos` · `movimientos_inventario` · `pedidos` · `pedido_items` · `buffet_tickets_turno` · `mermas` · `mensajes_chat` · `afluencia_ingresos` · `turnos` · `domain_events` · `audit_log` · `feature_flags` · `operaciones_idempotentes`

Antes de crear una tabla: verificar esta lista y el ER en `ARCHITECTURE.md §8`.

`domain_events` y `audit_log` tienen triggers que bloquean UPDATE/DELETE. `audit_log` tiene hash chain SHA-256 — no mutarlas desde código.

**Pedidos — optimistic locking:** siempre `.eq('version', pedido.version)` en updates. Transición: `creado → en_preparacion → despachado → entregado`.

---

## Real-time

```
SuperUser ─── Admin
               │
             COCINA  ← nodo central
           /   │   \
        AMEX  SNACK  BUFFET  ← no se hablan entre sí
```

`CHANNELS` y `CHANNEL_ACL` en `packages/shared-types/src/socket-events.ts` son **autoritativos**. Canal nuevo → verificar topología y actualizar `CHANNEL_ACL`.

Canal sin permiso → desconexión inmediata + `audit_log` (evento de seguridad, no warning).

**Persistencia primero, broadcast después.** Si Socket.io falla, el evento queda en DB para reconciliación.

---

## Roles (fijos en código)

| Rol                         | Alcance                                                  |
| --------------------------- | -------------------------------------------------------- |
| `superuser`                 | God Mode: CRUD tenants, usuarios, auditoría              |
| `admin`                     | Operación completa: carta, recetas, inventario, reportes |
| `chef` / `sous_chef`        | KDS, producción, despacho, chat                          |
| `mesero_amex` / `recepcion` | Pedidos Amex, confirmación entrega                       |
| `personal_snack`            | Stock Out Snack, Stuart                                  |
| `personal_buffet`           | Stock Out Buffet, Stuart, tickets cierre                 |
| `personal_almacen`          | Gestión bodega, recepción de lotes                       |
| `personal_pasteleria`       | Producción pastelería                                    |
| `steward`                   | Gestión utensilios (Stuart)                              |

Antes de agregar un rol: verificar si se resuelve con permisos opcionales del SuperUser.

---

## Patrones de código

**Server Actions:** `'use server'` + Zod + `assertCan(perm)` + `auditLog(...)`, sin excepción.

**Result type** (`lib/result.ts`): `{ ok: true; value: T } | { ok: false; error: AppErrorPayload }`. Sin `try/catch` ad-hoc en dominio.

**Lecturas:** Supabase client directo (server o client según contexto).

**Código:** inglés. **UI:** español. **Commits:** español, Conventional Commits (`feat:`, `fix:`, `refactor:`…). **Ramas:** `feature/<modulo>`.

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

# Vuelos — Sprint 6
FLIGHTS_API_KEY=
FLIGHTS_API_URL=
```

---

## Analytics — KPIs diferenciados

- `cogs_per_passenger` = consumo real (recetas + merma operativa) / pasajeros — eficiencia operativa
- `cash_outflow_per_passenger` = compras del período / pasajeros — flujo de caja

Solo lectura de vistas materializadas. Filtros obligatorios en todo reporte: turno, nodo, responsable, período.

---

## Reglas operativas

1. **Inventario/recetas:** releer Principio Rector y `ARCHITECTURE.md §9` antes de tocar.
2. **Descuentos de stock:** siempre vía `fn_descontar_insumo_fefo`. No reimplementar en TypeScript.
3. **Módulo nuevo:** hexagonal estricto — `domain → application → infrastructure → actions.ts`.
4. **Canal Socket.io nuevo:** verificar topología y actualizar `CHANNEL_ACL` en shared-types.
5. **Tabla nueva:** verificar lista de módulos y ER en `ARCHITECTURE.md §8`.
6. **Idempotencia offline:** Stock Out, despacho y tickets requieren `idempotency_key` siempre.
7. **Precedencia:** `CLAUDE.md` > `ARCHITECTURE.md` > `docs/analisis-v6.docx`. Contradicción → preguntar.
8. **Stack y decisiones congeladas:** no sugerir cambios sin pedido explícito.

---

_v4.0 — Mayo 2026 · Sprint 1 en curso_
