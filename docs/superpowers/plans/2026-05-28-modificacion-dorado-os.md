# Modificación Dorado Lounge → Plataforma Operacional (Plan Maestro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocalizar el sistema actual de ERP administrativo a plataforma operacional (bodega → cocina/KDS → trazabilidad en tiempo real → métricas), conservando todo el cimiento sólido (hexagonal, RLS, FEFO, hash chain, tests).

**Architecture:** Modificación incremental sobre el monorepo existente. Cada fase produce software verificable por sí sola y no avanza sin `pnpm lint && pnpm typecheck && pnpm test` en verde. La remoción de módulos innecesarios ya está hecha y type-clean; el trabajo real es resolver la auditoría enterprise y reforzar el núcleo de trazabilidad + métricas operacionales.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Supabase (PostgreSQL 15 + RLS), Socket.io, Zod, Vitest, Playwright.

**Baseline verificado (2026-05-28):** typecheck exit 0 · 291 tests `apps/web` en verde · remoción vuelos/afluencia/snack/buffet aplicada en working tree (sin commitear).

---

## Decisión de alcance — 5 fases independientes

| Fase  | Subsistema                      | Produce                                                                | Detalle en este doc              |
| ----- | ------------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| **1** | Cierre de la remoción           | Working tree limpio + migración aplicada                               | Bite-sized (lista para ejecutar) |
| **2** | Auditoría enterprise — CRÍTICOS | 22 críticos resueltos (varios ya muertos por la remoción)              | Nivel tarea + fix textual        |
| **3** | Núcleo de trazabilidad          | `prioridad`, `cocinero asignado`, `área responsable`, ruteo auto a KDS | Nivel tarea + criterios          |
| **4** | Métricas operacionales en vivo  | MVs de tiempos + dashboard operativo                                   | Nivel tarea + criterios          |
| **5** | Auditoría enterprise — ALTOS    | 42 altos triados y resueltos                                           | Backlog priorizado               |

> Fases 2–5: al iniciar cada una, generar su propio plan bite-sized con writing-plans. Aquí quedan a nivel de tarea con criterios de aceptación y referencias de archivo exactas.

---

## FASE 1 — Cerrar la remoción en curso

**Objetivo:** dejar el working tree limpio y la migración de remoción aplicada. Es la fase más barata: ya está type-clean y los tests pasan.

**Files:**

- Verificar: working tree completo (110 archivos)
- Apply: `supabase/migrations/20260528000000_remove_vuelos_afluencia_snack_buffet.sql`
- Modify (probable): `packages/shared-types/src/enums.ts` (decidir destino de `ZonaServicio.snack/buffet`)

- [ ] **Step 1.1 — Confirmar baseline en verde**

Run:

```bash
pnpm lint && pnpm --filter @dorado/web exec tsc --noEmit && pnpm test
```

Expected: lint OK · tsc exit 0 · 291+ tests passed.

- [ ] **Step 1.2 — Decidir `ZonaServicio` snack/buffet**

`ZonaServicio` aún expone `snack` y `buffet` (enums.ts:70-74). La redefinición las conserva como **orígenes de pedido** (sección 3), no como módulos. **Decisión: mantenerlas.** No tocar el enum. Documentar en el commit que snack/buffet sobreviven sólo como `ZonaServicio` de origen, sin módulo de inventario propio.

- [ ] **Step 1.3 — Verificar que no quedan referencias a rutas/links muertos en el sidebar**

Run:

```bash
grep -rn "afluencia\|/vuelos\|/snack\|/buffet\|flights" apps/web/src/components/layout/sidebar.tsx apps/web/src/lib/auth/role-home.ts
```

Expected: 0 resultados (ya borrados). Si aparece alguno → eliminarlo.

- [ ] **Step 1.4 — Commit de la remoción**

```bash
git add -A
git commit -m "refactor: remover módulos vuelos/afluencia/snack/buffet — refoco operacional

snack/buffet sobreviven sólo como ZonaServicio de origen de pedidos.
Migración 20260528000000 dropea afluencia_ingresos, vuelos_snapshots,
buffet_tickets_turno y MVs de ocupación/COGS-per-passenger.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 1.5 — Aplicar migración vía CI**

La migración se aplica con `supabase db push` por CI (nunca local). Push de la rama y verificar el workflow verde. Confirmar en Supabase que `afluencia_ingresos`/`vuelos_snapshots`/`buffet_tickets_turno` ya no existen y que `refresh_analytics_views()` sólo refresca `mv_consumo_vs_produccion_turno`.

**Criterio de aceptación Fase 1:** working tree limpio · CI verde · migración aplicada · app arranca (`pnpm dev`) sin rutas rotas.

---

## FASE 2 — Auditoría enterprise: CRÍTICOS (bloquean deploy)

**Objetivo:** resolver los 22 hallazgos críticos de `enterpriseaudit20260527.md`. La remoción de Fase 1 **mata varios sin trabajo** (ganancia gratis).

### 2.0 — Críticos eliminados por la remoción (verificar y cerrar)

- [ ] **C-02** (`recepcion` RLS afluencia) → MUERTO: tabla `afluencia_ingresos` dropeada. Verificar que ya no se referencia.
- [ ] **C-06 parcial** (MVs sin RLS) → `mv_cogs_per_passenger` y `mv_ocupacion_diaria` dropeadas. Queda **sólo `mv_consumo_vs_produccion_turno`** por blindar (ver 2.4).
- [ ] **C-07** (retención chat vs trigger) → sigue vivo si `mensajes_chat` permanece. Confirmar que el módulo `chat` se conserva; si sí, aplicar fix.

### 2.1 — Integridad de inventario (núcleo del Principio Rector)

- [ ] **C-04 — FEFO + transición no atómicos.** Crear RPC `fn_completar_tanda(p_tanda_id, p_ingredientes, p_idempotency_key)` que haga deducción FEFO + update de estado en UNA transacción Postgres. Archivos: `production/actions.ts:121-161`, `orders/actions.ts:352-384`. TDD: test de fallo post-deducción no debe dejar stock decrementado sin tanda.
- [ ] **C-21 — FEFO usa lotes vencidos.** Añadir al cursor FEFO en `20260503132430_0008_rpcs.sql:99-111`: `AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)`. Migración nueva idempotente (`CREATE OR REPLACE FUNCTION`). Test: lote vencido NO se selecciona.
- [ ] **C-19 — `completarTanda` falso STOCK_INSUFICIENTE en retry.** En `production/actions.ts:142-158`, distinguir `error.code === 'P0001'` (stock real) de resultado `null` (idempotente), igual que en `orders/actions.ts`. Test: segundo retry con misma idempotency key → `ok`.
- [ ] **A-12 (elevar a esta fase) — `fn_descontar_insumo_fefo` pre-check TOCTOU.** Mover el chequeo de suficiencia dentro del `FOR UPDATE`. Relacionado con C-04.

### 2.2 — Multi-tenant / escalada de privilegios

- [ ] **C-01 — Admin enumera usuarios cross-tenant.** En `superuser/actions.ts:80`, `getUsers`: `const scopedTenantId = ctx.role === 'superuser' ? tenantId : ctx.tenantId;`. Test de aislamiento: admin de tenant A no ve usuarios de B.
- [ ] **C-08 — `idempotency_key` UNIQUE global.** Migración: `ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_idempotency_key_key;` (conservar el índice parcial por tenant existente). Test: dos tenants con misma key → ambos crean pedido.
- [ ] **C-17 — `lotes` INSERT excluye `personal_almacen`.** Migración: añadir `personal_almacen` a la política `lotes_modify_admin` y eliminar el workaround `createAdminClient()` en el repo de inventory. Test RLS: `personal_almacen` inserta lote; otro rol no.
- [ ] **C-03 — Roles no-admin no pueden gestionar sus turnos.** Revisar política RLS de `turnos`; permitir que cada rol gestione su propio turno. Test por rol.

### 2.3 — Trazabilidad / auditoría

- [ ] **C-05 — Race condition hash chain.** En el trigger de `audit_log`, serializar con `SELECT pg_advisory_xact_lock(hashtext(p_tenant_id::text));` o `FOR UPDATE` en el `SELECT prev_hash`. Test de concurrencia (dos inserts simultáneos no forkean la cadena).
- [ ] **C-18 — `cocina-amex/domain` importa `orders/domain`.** Mover `EstadoPedido`/`PEDIDO_TRANSITIONS`/tipos compartidos a `@dorado/shared-types` (ya están en enums.ts — `cocina-amex` debe importar de shared-types, no de orders/domain). Eliminar import en `cocina-amex/domain/pedido-amex.ts:10-11`. Extender regla ESLint para bloquear imports cross-módulo de `domain/`. (Item C-18/A-27 marcado urgente en memoria de proyecto.)

### 2.4 — RLS de la MV superviviente

- [ ] **C-06 (resto) — `mv_consumo_vs_produccion_turno` sin RLS.** Crear vista filtrada `v_consumo_vs_produccion_turno_tenant` con `WHERE tenant_id = (auth.jwt()...)` y revocar SELECT directo a la MV para `authenticated`. Apuntar el repo de analytics a la vista. Test cross-tenant.

### 2.5 — Frontend / infraestructura crítica

- [ ] **C-09 — Wi-Fi pass hardcodeada** en `qr-passenger-app.tsx`. Mover a variable de entorno server-side; no exponer en bundle. (Verificar si el módulo QR se conserva tras el refoco.)
- [ ] **C-10 — `/api/heartbeat` y `/health` bloqueados por middleware.** Añadir a la allowlist del middleware. Test e2e: 200 sin auth.
- [ ] **C-11 — HTML inválido (`<html>`/`<body>` anidados) en QR layout.** Corregir layout.
- [ ] **C-20 — ThemeProvider duplicado.** `storageKey="dorado-qr-theme"` en el QR layout.
- [ ] **C-12, C-13, C-14, C-15, C-16, C-22 — DevOps/CI/secrets.** Triar en bloque (CRON_SECRET fuera de pg_settings, pinning de actions por SHA, deploy espera CI, backup encriptado GPG, guardia de prod en scripts destructivos, Supabase ref fuera de CI). Cada uno con su fix textual en el audit doc.

**Criterio de aceptación Fase 2:** los 22 críticos cerrados o documentados como muertos · nuevas migraciones idempotentes aplicadas vía CI · tests nuevos por cada fix de lógica/RLS · `pnpm test` verde.

---

## FASE 3 — Núcleo de trazabilidad (PRIORIDAD MÁXIMA de la redefinición)

**Objetivo:** completar el modelo de pedido para cubrir TODOS los campos de la sección 4 de la redefinición. Lo que ya existe: `createdAt`, estados `creado→recibido_cocina→en_preparacion→despachado→entregado`, `pedido_eventos` con `actor_id`, `PedidoTimestamps` derivados, `cantidad` (items), `zona` (tipo de servicio). **Gaps reales: `prioridad`, `cocinero asignado`, `área responsable` explícita, ruteo automático a KDS.**

### 3.1 — Migración aditiva de pedido

- [ ] **Tarea 3.1 — Campos nuevos.** Migración idempotente: `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS prioridad smallint NOT NULL DEFAULT 3` (1=alta..5=baja), `ADD COLUMN IF NOT EXISTS cocinero_id uuid REFERENCES auth.users(id)`, `ADD COLUMN IF NOT EXISTS area_responsable area_produccion`. Enum `Prioridad` en shared-types. Test: defaults correctos.

### 3.2 — Ruteo automático a KDS

> **Gap de modelo detectado:** existen los roles `chef_cocina_fria`/`chef_cocina_caliente` y sus rutas (`role-home.ts:7-8`), pero `AreaProduccion` (enums.ts:62-66) sigue siendo `{cocina, pasteleria, amex}` — NO distingue caliente/fría. El ruteo a 4 KDS exige resolver esto primero.

- [ ] **Tarea 3.2a — Extender `AreaProduccion`.** Migración + enums.ts: dividir `cocina` en `cocina_caliente`/`cocina_fria` (conservar `cocina` como valor legacy inerte, no DROP VALUE). Añadir a `recetas` la clasificación caliente/fría (columna `area_produccion area_produccion` o flag en receta). Migración aditiva idempotente. Test: enum expone los 4 destinos.
- [ ] **Tarea 3.2b — Domain de ruteo.** En `orders/domain/`, función pura `routeToKds(items): AreaProduccion` que deriva el KDS destino del `area_produccion` de las recetas de los items. Reglas: receta caliente→`cocina_caliente`, fría→`cocina_fria`, pastelería→`pasteleria`, zona amex→`amex`. Cubrir el caso de pedido mixto (decisión abierta #1: ¿se divide o va al área dominante?). Test exhaustivo por combinación.
- [ ] **Tarea 3.3 — Persistir `area_responsable` al crear pedido** en `orders/application/create-pedido.ts` usando `routeToKds`. Test: pedido de zona buffet con receta caliente → `area_responsable = cocina`.

### 3.3 — Eventos enriquecidos + tiempo real

- [ ] **Tarea 3.4 — Evento "envío a cocina" explícito.** La redefinición distingue _creación_ vs _envío a cocina_ vs _aceptación_. Confirmar mapeo: `creado`(creación+envío) → `recibido_cocina`(aceptación) → `en_preparacion`(inicio) → `despachado`(fin). Si se necesita separar envío de creación, añadir estado intermedio o timestamp. **Decisión a confirmar con usuario.**
- [ ] **Tarea 3.5 — Asignación de cocinero.** Action `asignarCocinero(pedidoId, cocineroId)` con `assertCan` + `auditLog`, registra evento. Broadcast Socket.io al canal del KDS. Test transición + optimistic locking.
- [ ] **Tarea 3.6 — Verificar persistencia-primero.** Confirmar que cada transición escribe `pedido_eventos` ANTES del broadcast (patrón ya usado en cocina-amex). Test: si el broadcast falla, el evento queda en DB.

**Criterio de aceptación Fase 3:** un pedido creado desde cualquier zona se rutea solo al KDS correcto, se le asigna cocinero, y su historial completo (todos los timestamps de la sección 4) es consultable y se refleja en vivo en el KDS. Tests de dominio para `routeToKds` con cobertura de todas las combinaciones.

---

## FASE 4 — Métricas operacionales en vivo

**Objetivo:** las métricas de la sección 5 (tiempos, productividad, flujo). El `analytics` actual era COGS/consumo; la remoción dropeó las MVs de pasajeros. Esto es **construcción nueva** sobre `pedido_eventos`.

### 4.1 — Vistas materializadas de tiempos

- [ ] **Tarea 4.1 — `mv_tiempos_pedido`.** Por pedido: `tiempo_total`, `tiempo_cocina` (recibido→despachado), `tiempo_espera_aceptacion`, por área/cocinero/turno/hora. Derivada de `pedido_eventos`. RLS vía vista `_tenant` (patrón C-06). Función de refresh + `pg_cron` cada N min.
- [ ] **Tarea 4.2 — `mv_productividad_cocinero`.** Pedidos atendidos, tiempo promedio individual, rendimiento por turno.
- [ ] **Tarea 4.3 — `mv_flujo_operativo`.** Pedidos completados por hora, pendientes, retrasados (vs umbral de demora ya en `alertas`), horas pico, saturación por cocina, volumen diario.

### 4.2 — Lectura y dashboard

- [ ] **Tarea 4.4 — Extender módulo `analytics`** (solo lectura) con ports/queries a las nuevas vistas `_tenant`. Filtros obligatorios: turno, nodo (área), responsable, período.
- [ ] **Tarea 4.5 — Dashboard operativo en vivo** (`/admin` o ruta nueva): tarjetas de KPIs en tiempo real (pendientes, retrasados, tiempo promedio por cocina, completados/hora), suscritas a Socket.io. Táctil, modo oscuro. i18n es/en. Sin strings hardcodeados.

**Criterio de aceptación Fase 4:** dashboard muestra tiempos reales por cocina/cocinero/turno con filtros, actualizándose en vivo. Vistas con RLS por tenant. Tests de las queries de analytics.

---

## FASE 5 — Auditoría enterprise: ALTOS (42)

**Objetivo:** triar y resolver los 42 altos. Varios mueren con la remoción (A-11 snack no descuenta, A-20 stale closure FlightsBoard, A-28 buffet_tickets). Priorizar los que tocan el núcleo nuevo:

- [ ] **A-14** — `pedido_eventos` INSERT sin restricción de rol (toca Fase 3).
- [ ] **A-09** — `stockOut` usa `p_tipo: 'ajuste'` en vez de `salida_receta` (Principio Rector).
- [ ] **A-19** — `toggleDisponibilidadPlato` con permiso incorrecto.
- [ ] **A-02** — QR tokens sin expiración (si QR se conserva).
- [ ] **A-27** — GDPR `forget` no elimina PII de tablas de app (marcado urgente en memoria).
- [ ] **Resto** — triar A-01..A-42, descartar los muertos por remoción, agrupar por archivo, resolver con TDD.

**Criterio de aceptación Fase 5:** altos cerrados o documentados como aceptados/muertos · suite verde · `dorado-pre-deploy` checklist en verde.

---

## Verificación global (cada fase)

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dorado/web test:e2e   # antes de cerrar fases 3 y 4
```

Migraciones siempre idempotentes y aplicadas vía CI (`supabase db push`) — nunca local. Commits frecuentes, Conventional Commits en español, rama `feature/<fase>`.

## Decisiones abiertas para el usuario

1. **Pedido mixto** (items de varias áreas): ¿se divide en sub-órdenes por KDS, o va al área dominante? (Tarea 3.2)
2. **Envío vs creación** de pedido: ¿se necesitan como dos eventos separados o `creado` cubre ambos? (Tarea 3.4)
3. **Módulos QR y chat**: ¿se conservan tras el refoco operacional? Afecta C-07, C-09, C-11, A-02.
