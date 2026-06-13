# Remoción definitiva: vuelos · afluencia · recepción — Diseño

**Fecha:** 2026-06-13
**Branch:** `chore/limpieza-codigo-muerto` (extiende el alcance del PR de limpieza)
**Estado:** diseño aprobado por el dueño (2026-06-13)

## Objetivo

Eliminar definitivamente del sistema todo lo que quedó **fuera del alcance operativo
vigente** tras el refoco: **vuelos** (flights), **afluencia / pronóstico de pasajeros**,
**registro de clientes al ingreso de sala (recepción)** y el rol **`recepcion`**.
El alcance vigente son las áreas: **AMEX · Snack · Buffet · Almacén · Cocina (caliente,
fría, pastelería, AMEX)**.

> Decisión del dueño (2026-06-13): se elimina **solo** el rol `recepcion`. Se **conservan**
> `chef` (supervisor `/cocina`) y `steward` (`/producción`) porque pertenecen al área Cocina.
> **No** se renombran identificadores de roles (los actuales ya mapean 1:1 a las áreas).

## Contexto (estado real auditado)

El refoco operacional (plan `2026-05-28-modificacion-dorado-os.md`) ya decidió esta remoción
y dejó la migración `20260528000000_remove_vuelos_afluencia_snack_buffet.sql` **escrita pero
nunca aplicada en prod** (gateada al merge). Posteriormente snack/buffet **volvieron** como
features vivas (PR #18), por lo que aquella migración quedó desalineada.

Auditoría 2026-06-13 contra prod (`gyewxgtuzjbxzcvcfmwy`):

- **Front-end:** ya **no** existen rutas `/recepcion`, `/vuelos`, `/afluencia`, `/scanner`,
  `/pasajeros`. ✅
- **Enum TS `UserRole`:** ya **no** incluye `recepcion`. `lib/auth/permissions.ts` y
  `role-home.ts` tampoco la referencian. ✅
- **Módulo `analytics` (TS):** sin referencias a afluencia/ocupación/cogs/passenger. ✅
- **DB (prod):** las tablas **siguen existiendo físicamente** — ningún `DROP TABLE`
  destructivo del refoco corrió realmente (incluye también `mensajes_chat` del módulo chat ya
  retirado). Confirmado por probe read-only.
- **Código muerto residual:** `lib/scanner/*` (parser BCBP de tarjetas de embarque, sin uso
  vivo), `registrarIngresoSchema` en shared-validation (solo usado por su propio test),
  i18n namespace `analytics.flights` + claves COGS/pasajeros (huérfanas).
- **Usuario huérfano en prod:** `recepcion@dorado.test` (rol `recepcion`).

## Enfoque elegido

**A — Migración forward idempotente vía CI + limpieza de código/docs en el mismo PR;
reconciliación de usuarios de prod por separado.**

- Una migración nueva con `DROP ... IF EXISTS` aplica limpio **sin importar** lo que diga el
  historial de `schema_migrations` (resuelve la incógnita "¿ya corrió 20260528000000?").
- Enum `user_role`: `recepcion` queda **inerte** (Postgres no permite `DROP VALUE` sin
  recrear el tipo; recrearlo es riesgoso por las dependencias en `users.role` + RLS). Se
  documenta con comentario. El valor queda inalcanzable una vez no haya filas ni políticas
  que lo usen.
- No se reescribe la migración histórica `20260528000000` (es historia inmutable).

Rechazados: **B** (recrear enum — riesgo alto en prod, beneficio marginal), **C** (drops
manuales vía SQL/MCP — drift con el historial de migraciones).

## Diseño detallado

### 1. Base de datos — `supabase/migrations/<ts>_remove_vuelos_afluencia_recepcion.sql`

Migración idempotente, transaccional. Espeja el contenido de `20260528000000` pero **sin
tocar snack/buffet vigentes** y con `IF EXISTS` en todo:

- **Tablas:** `DROP TABLE IF EXISTS` `pasajeros_ingreso`, `afluencia_ingresos`,
  `vuelos_snapshots`, `aircraft_capacity`, `buffet_tickets_turno`, **`mensajes_chat`**
  (chat ya retirado del código).
- **Materialized views:** `mv_cogs_per_passenger`, `mv_ocupacion_diaria`.
- **Views:** `v_cogs_per_passenger_tenant`, `v_ocupacion_diaria_tenant`, `v_pasajeros_turno`.
- **Funciones:** `refresh_ocupacion_diaria()`, `refresh_ocupacion_diaria_initial()`,
  `fn_purgar_afluencia_antigua()`.
- **Recrear** `refresh_analytics_views()` → solo `mv_consumo_vs_produccion_turno`
  (sin cogs/ocupación), con los `REVOKE`/`GRANT` actuales.
- **Recrear** `v_retencion_estado`: como `mensajes_chat` y `afluencia_ingresos` desaparecen,
  la vista de retención queda **sin tablas objetivo** → recrearla como vista vacía/no-op
  (o eliminarla junto con su documentación) — definir en el plan según lo que aún tenga
  sentido retener (90d). Default: vista que reporta 0 filas a purgar.
- **pg_cron:** des-agendar cualquier job que invoque `fn_purgar_afluencia_antigua`
  (loop sobre `cron.job` con `EXCEPTION WHEN undefined_table OR insufficient_privilege`).
- **Enum `user_role`:** dejar `recepcion` inerte + `COMMENT` explicando que es un valor
  muerto post-remoción 2026-06-13.

**Gate:** la migración aplica a prod vía CI al merge (camino estándar). Pérdida de datos
**irreversible** — autorizada explícitamente por el dueño.

### 2. Código de aplicación

- **Borrar** `apps/web/src/lib/scanner/` completo (`parse-bcbp.ts`,
  `use-document-scanner.ts`, `scanner.test.ts`) — sin importadores vivos.
- **Borrar** `registrarIngresoSchema` de `packages/shared-validation/src/index.ts` y su
  bloque de test en `packages/shared-validation/src/tests/schemas.test.ts`. Verificar que no
  queden tipos/exports colgando (p. ej. `RegistrarIngresoInput`).
- **i18n** (`apps/web/src/messages/{es,en}.json`):
  - Borrar el namespace **`analytics.flights`** completo (vuelos, status, stats, forecast).
  - Borrar las claves COGS/pasajeros huérfanas de `analytics`: `cogsTitle`, `kpiTotalPasajeros`,
    `kpiTotalPasajerosDesc`, `kpiCogsTotal`, `kpiCogsTotalDesc`, `kpiCogsPorPasajero`,
    `kpiCogsPorPasajeroDesc`, `cogsEmpty`, `colPasajeros`, `colCogsTotal`, `colCogsPorPasajero`
    — **verificar cada una** contra `components/analytics/analytics-panel.tsx` antes de
    borrar (conservar las de consumo: `consumoTitle`, `consumoEmpty`, `colInsumo`, filtros…).
  - Actualizar `analytics.pageSubtitle` → quitar "COGS por pasajero" (queda
    "Consumo vs producción por turno").
  - Mantener **simetría es↔en** (verificación automatizada al cierre).

### 3. Usuarios (producción)

- Añadir `'recepcion@dorado.test'` a `LEGACY_EMAILS` en `scripts/reset-test-users.mjs`
  (junto a los ya listados) para que la reconciliación lo purgue (auth + `public.users`).
- Ejecutar `reset:test-users` con `ALLOW_PRODUCTION_RESET=yes_i_know` **después del merge**:
  purga `recepcion`, recrea `soushef` + `buffet` (borrados por el dueño), deja el set canónico
  en **12 usuarios** todos con `Admin123`.
- Validar con `scripts/validate-test-users.mjs` (read-only) → 12/12 OK, 0 extras.

### 4. Documentación

- `CLAUDE.md`: quitar la fila del rol `recepcion` del mapa "UIs por Rol".
- `ARCHITECTURE.md`: podar/marcar como ELIMINADO las secciones de vuelos/afluencia/COGS-por-
  pasajero (2.11 API de vuelos, vistas COGS por pasajero, nodos de afluencia en diagramas).
  No reescribir ADRs históricos; marcar con nota de remoción 2026-06-13.

### 5. No tocar

- Migración histórica `20260528000000` (inmutable).
- `/qr` de pasajeros (menú anónimo de mesa) — **se conserva**.
- "Recepción de inventario/lotes" (merma en recepción, Principio Rector) — **no es** la
  recepción/registro de clientes; es CORE y no se toca.
- Roles `chef`, `steward`, `sous_chef` y todos los demás.

## Unidades de trabajo (para el plan)

| #   | Unidad                                           | Aislamiento                          | Verificación                 |
| --- | ------------------------------------------------ | ------------------------------------ | ---------------------------- |
| 1   | Migración SQL de remoción                        | un archivo en `supabase/migrations/` | Supabase Preview verde en CI |
| 2   | Borrar `lib/scanner/` + `registrarIngresoSchema` | TS/validación                        | typecheck + tests            |
| 3   | Limpieza i18n (flights + cogs/pasajeros)         | messages es/en                       | simetría + lint              |
| 4   | `reset-test-users.mjs` (LEGACY recepcion)        | un script                            | dry-read con validate        |
| 5   | Docs (CLAUDE.md, ARCHITECTURE.md)                | markdown                             | revisión                     |
| 6   | Reconciliación de usuarios en prod               | runtime (post-merge)                 | validate-test-users 12/12    |

## Criterios de aceptación

- `pnpm lint && pnpm typecheck && pnpm test` verdes.
- Simetría i18n es↔en preservada; sin claves huérfanas de vuelos/afluencia/cogs.
- Migración aplica idempotente en Supabase Preview (CI).
- Tras merge + reconcile: prod sin tablas `pasajeros_ingreso`/`afluencia_ingresos`/
  `vuelos_snapshots`/`aircraft_capacity`/`buffet_tickets_turno`/`mensajes_chat`; sin usuario
  `recepcion@dorado.test`; set canónico de 12 usuarios OK.
- `grep` de `vuelo|afluencia|bcbp|pasajeros_ingreso|registrarIngreso` en `apps/web/src` y
  `packages/` sin resultados vivos (excepto `/qr` de pasajeros, que se conserva).

## Riesgos

- **Pérdida de datos irreversible** al aplicar los `DROP TABLE` en prod. Autorizado por el
  dueño. Mitigación: backup automático pre-deploy (workflow existente) + migración revisada
  en Supabase Preview antes del merge.
- **Dependencias ocultas** de las vistas/funciones a eliminar → mitigado con `IF EXISTS` +
  `CASCADE` selectivo solo donde el plan lo justifique, y validación en Preview.
- **`v_retencion_estado`** queda sin tablas objetivo → decidir en el plan si se elimina o se
  deja como no-op.
