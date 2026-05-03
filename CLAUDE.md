# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sistema SaaS multi-tenant 24/7 para gestión de sala VIP aeroportuaria (GISAT S.A. — Dorado Lounge, El Dorado, Bogotá). Código es propiedad del desarrollador; cliente adquiere licencia.

Documento de análisis completo: `docs/analisis-v6.docx` | Arquitectura detallada: `ARCHITECTURE.md`

---

## Commands

```bash
# Monorepo (pnpm workspaces)
pnpm dev                        # arranca web + socket-server en paralelo
pnpm build                      # build de todos los paquetes
pnpm lint                       # eslint + prettier check en todos los paquetes
pnpm test                       # vitest unit + integration (todos los paquetes)
pnpm test --filter apps/web     # tests solo de web
pnpm test -- --run src/modules/inventory  # correr tests de un módulo específico

# Dentro de apps/web
pnpm --filter apps/web dev
pnpm --filter apps/web test:e2e           # playwright
pnpm --filter apps/web tsc --noEmit       # type-check sin build

# Database workflow (cloud only)
# Las migraciones viven en supabase/migrations/*.sql
# Se aplican vía integración GitHub + Supabase en cada PR / merge.
# Nunca usar supabase start ni Docker local en este proyecto.

# Socket server
pnpm --filter apps/socket-server dev      # nodemon con ts-node
```

> Sprint 0 en progreso: si los scripts aún no existen en `package.json`, agregarlos como parte del task.

---

## Stack (no cambiar sin discutir)

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 App Router + TypeScript strict |
| UI | React + Tailwind CSS + shadcn/ui |
| DB / Auth | Supabase (PostgreSQL 15 + Auth + Storage) |
| Real-time | Socket.io en Node.js independiente (Render.com) |
| Validación | Zod + React Hook Form |
| i18n QR | next-intl (`/qr/[locale]` con es/en/fr/pt) |
| Testing | Vitest (unit/integration), Playwright (E2E), pgTAP (DB) |
| Observabilidad | Sentry + Axiom + Better Stack |
| Deploy | Vercel (web) + Render.com Starter (socket) |

---

## Principio rector — INVIOLABLE

**Nada sale de cocina sin receta.** Todo movimiento de inventario está vinculado a una receta con `merma_coeficiente`. No existe descuento sin receta. Si algo no encaja, **detenerse y preguntar antes de codificar**.

---

## Arquitectura del monorepo

```
apps/web/            Next.js — UI + Server Actions
apps/socket-server/  Node.js — Socket.io con JWT auth
packages/shared-types/       Tipos y contratos compartidos (SocketEvent, CHANNELS, CHANNEL_ACL)
packages/shared-validation/  Schemas Zod reutilizables
packages/eslint-config/      Config ESLint compartida
supabase/migrations/         SQL idempotente (CI aplica via supabase db push)
```

`packages/shared-types` es la fuente de verdad del contrato entre web y socket-server. Si un evento cambia de forma, cambia aquí primero.

---

## Arquitectura interna de cada módulo (Hexagonal + DDD)

Cada bounded context en `apps/web/src/modules/<nombre>/` sigue esta estructura rígida:

```
domain/         Entidades, value objects, eventos de dominio. Sin imports externos.
application/    Casos de uso. Solo importa domain/ y sus propios ports/.
infrastructure/ Adaptadores (Supabase repos, mappers). Implementa los ports.
actions.ts      ÚNICA superficie pública del módulo (Server Actions exportadas).
tests/
```

**Regla de dependencia:** `domain ← application ← infrastructure ← actions.ts`

ESLint enforcement activo: `domain/` y `application/` no pueden importar de `infrastructure/` ni usar `@supabase/*` directamente. Si falla el linter en `domain/`, el diseño está mal.

`actions.ts` es la Composition Root: cablea infrastructure → application → response. Código fuera del módulo solo puede importar de `actions.ts`.

**Bounded contexts (módulos):**
- **Core** (no dependen de nadie): `inventory`, `recipes`, `production`
- **Supporting** (orquestan core): `orders`, `buffet`, `snack`, `affluence`
- **Generic**: `identity`, `tenants`, `rbac`, `realtime`, `audit`, `analytics`

`analytics` es solo-lectura (proyecta desde vistas materializadas, no emite eventos).

---

## Inventario — algoritmos críticos

### Coeficiente de merma

```typescript
// modules/inventory/domain/merma.ts — función pura, 90%+ coverage obligatoria
export function cantidadConMerma(cantidadRequerida: number, coeficiente: number): number {
  // cantidad_a_descontar = cantidad_requerida / (1 - coeficiente)
  return Math.round((cantidadRequerida / (1 - coeficiente)) * 10000) / 10000;
}
```

Esta función no tiene dependencias externas. Si sus tests fallan, el deploy se bloquea.

### Descuento FEFO — ocurre en SQL, no en TypeScript

Las operaciones de descuento de inventario se ejecutan como RPCs de Postgres (`fn_descontar_insumo_fefo`), no como transacciones coordinadas desde Node. Esto garantiza atomicidad con `FOR UPDATE` sin viajes round-trip. **No reimplementar esta lógica en TypeScript.**

El RPC maneja idempotencia por `idempotency_key`: si la key ya existe, devuelve el resultado previo sin efectos secundarios.

### Dos capas de inventario

- `capa_1` — Materia prima de bodega (harina, pollo…)
- `capa_2` — Producción interna (pandebonos, ensaladas…)

`receta_produccion`: Capa 1 → Capa 2 | `receta_servicio`: Capa 1/2 → Zona (despacho)

### Tres zonas — cuándo ocurre el descuento

| Zona | Descuento |
|---|---|
| Amex | Al confirmar entrega del pedido |
| Snack | Al despachar desde cocina |
| Buffet | Al despachar lote al buffet. Conciliación al cierre con tickets recolectados |

Buffet NO registra consumo individual en tiempo real. `1 ticket = 1 servicio`, ingresado al cierre del turno.

---

## Patrones de DB — convenciones obligatorias

- Todos los IDs: `uuid` con `gen_random_uuid()`.
- Todas las tablas tenant-scoped: `tenant_id uuid NOT NULL` + RLS habilitada.
- Multi-tenancy se enforza en **Postgres vía RLS**, no solo en la aplicación. La app nunca confía en sí misma para filtrar tenants.
- Soft delete: `deleted_at` nullable (excepto `audit_log` y `domain_events` que son inmutables).
- Monetario: `numeric(14,2)` en COP. Nunca `float`.
- Cantidades: `numeric(12,4)` para soportar gramos/ml.
- Timestamps: `timestamptz`, siempre UTC en DB.
- Migraciones: idempotentes. Nunca `DROP COLUMN`/`DROP TABLE` en un solo paso.

### domain_events y audit_log — append-only real

Ambas tablas tienen triggers que bloquean `UPDATE` y `DELETE`. El `audit_log` además tiene hash chain SHA-256 para detección de tampering. No intentar mutar estas tablas desde código.

Cada Server Action empieza con `assertCan(perm)` y termina con `auditLog(...)`, sin excepción.

### Pedidos — máquina de estados con optimistic locking

```typescript
// Transición válida: 'creado' → 'en_preparacion' → 'despachado' → 'entregado'
// Update siempre incluye .eq('version', pedido.version) para detectar conflicto
```

---

## Real-time — Socket.io

### Topología jerárquica

```
SuperUser ─── Admin
               │
             COCINA  ← nodo central
           /   │   \
        AMEX  SNACK  BUFFET  ← nodos servicio (no se hablan entre sí)
```

### Canales y permisos

`CHANNELS` y `CHANNEL_ACL` definidos en `packages/shared-types/src/socket-events.ts` son **autoritativos**. Antes de crear un canal nuevo, verificar que no viola la topología jerárquica y actualizar `CHANNEL_ACL`.

Canales operativos: `sala:cocina` · `sala:amex` · `sala:snack` · `sala:buffet` · `sala:admin`
Stuart (utensilios): `sala:stuart:amex` · `sala:stuart:snack` · `sala:stuart:buffet`
Broadcast: `sala:broadcast:cocina` (chef emite) · `sala:broadcast:admin` (admin/superuser emite)

Un usuario que intente unirse a un canal sin permiso es desconectado y registrado en `audit_log` — es un evento de seguridad, no un warning.

### Persistencia primero, broadcast después

Cada evento operativo (Stock Out, dispatch, chat, broadcast) se persiste en Postgres **antes** de hacer broadcast por Socket.io. Si el broadcast falla, el evento queda en DB para reconciliación.

---

## Roles (RBAC fijos en código)

| Rol | Acceso |
|---|---|
| `superuser` | God Mode: CRUD tenants, usuarios, auditoría |
| `admin` | Operación completa: carta, recetas, inventario, reportes |
| `chef` / `sous_chef` | Producción batch, despacho, KDS, chat |
| `mesero_amex` | Pedidos por mesa, confirmación de entrega |
| `personal_snack` | Stock Out, Stuart, conteo de cierre |
| `personal_buffet` | Stock Out, Stuart, registro de tickets |

Los roles son constantes de código. El SuperUser configura permisos opcionales dentro de un rol (matriz finita), no la estructura de la UI. Antes de agregar un rol, revisar si se resuelve con permisos del SuperUser.

---

## Manejo de errores — Result type

```typescript
// lib/result.ts
type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

class AppError extends Error {
  constructor(public code: string, public httpStatus: number, message: string, public meta?: Record<string, unknown>) { ... }
}
```

Server Actions devuelven `Result<T>`. La UI discrimina casos. No hay `try/catch` ad-hoc en capas de dominio.

---

## Convenciones

- Código en inglés, UI en español.
- Mutaciones → Server Actions (`'use server'` + Zod + `assertCan` + `auditLog`).
- Lecturas → Supabase client directo (server o client según caso).
- Validaciones en `lib/validations/*.ts`.
- Operaciones críticas (Stock Out, despacho, ticket) → máximo 3 toques.
- Commits en español con Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.). Ramas: `feature/<modulo>`.
- Idempotency keys obligatorias en Stock Out, despacho y tickets (prevención de doble submit offline).

---

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # solo backend, nunca NEXT_PUBLIC_*
NEXT_PUBLIC_SOCKET_URL=         # Render.com socket server
FLIGHTS_API_KEY=                # API vuelos El Dorado (TBD — Sprint 6)
FLIGHTS_API_URL=
JWT_PASSENGER_SECRET=           # firma tokens QR anónimos de mesa (4h TTL)
```

`lib/supabase/admin.ts` es el único lugar que usa `SUPABASE_SERVICE_ROLE_KEY`. Todo lo demás usa el cliente anon o el server client con cookie de sesión.

---

## Módulos de DB (no improvisar tablas)

`tenants` · `users` · `insumos` · `lotes` · `recetas` (STI con `tipo_receta`) · `receta_ingredientes` · `tandas_produccion` · `despachos` · `movimientos_inventario` · `pedidos` · `pedido_items` · `buffet_tickets_turno` · `mermas` · `mensajes_chat` · `afluencia_ingresos` · `turnos` · `domain_events` · `audit_log` · `feature_flags`

Antes de crear una tabla, consultar este listado y el modelo E-R en `ARCHITECTURE.md §8`.

---

## Analytics

Dos KPIs separados (no mezclar):
- `cogs_per_passenger` = consumo aplicado por recetas + merma operativa / pasajeros (eficiencia real)
- `cash_outflow_per_passenger` = compras del período / pasajeros (flujo de caja)

Analytics solo lee vistas materializadas (`mv_consumo_vs_produccion_turno`, etc.), nunca escribe. Filtros obligatorios en todo reporte: turno, nodo, responsable, período.

---

## Decisiones congeladas (no re-discutir)

| Tema | Decisión |
|---|---|
| Real-time | Socket.io — control granular de canales |
| Buffet | Lotes + tickets al cierre (no registro individual) |
| Merma | Coeficiente por receta + categorización obligatoria |
| Multi-tenant | RLS de Postgres + `tenant_id` en cada tabla |
| QR pasajero | PWA pública `/qr/[locale]`, sin login, token de mesa |
| Inventory ops | RPC SQL atómica, no coordinación desde Node |
| Roles | Fijos en código, permisos opcionales configurables |
| Broadcast | Dos canales: `sala:broadcast:cocina` y `sala:broadcast:admin` |

---

## Reglas para Claude

1. Antes de tocar inventario o recetas, releer "Principio rector" y `ARCHITECTURE.md §9`.
2. Antes de crear un canal Socket.io, verificar topología y actualizar `CHANNEL_ACL` en `shared-types`.
3. Antes de crear una tabla, revisar la lista de módulos de DB y el ER en `ARCHITECTURE.md §8`.
4. Los descuentos de inventario siempre pasan por `fn_descontar_insumo_fefo` (RPC SQL). No reimplementar en TypeScript.
5. Todo módulo nuevo sigue Hexagonal: `domain → application → infrastructure → actions.ts`.
6. `CLAUDE.md` tiene precedencia sobre `ARCHITECTURE.md`. `ARCHITECTURE.md` tiene precedencia sobre `docs/analisis-v6.docx`. Ante contradicción real, preguntar.
7. No sugerir cambios de stack ni de decisiones congeladas sin que se pida explícitamente.

---

*v3.0 — Mayo 2025 · Sprint 0 en progreso · 6 meses de desarrollo*
