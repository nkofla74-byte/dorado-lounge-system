# Remoción definitiva vuelos · afluencia · recepción — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Eliminar definitivamente vuelos, afluencia/pronóstico de pasajeros, registro de clientes al ingreso (recepción) y el rol `recepcion` — código, base de datos, i18n, usuarios de prod y docs — conservando snack/buffet, QR de pasajeros, la recepción de inventario y los roles chef/steward.

**Architecture:** Una migración SQL forward idempotente (`DROP ... IF EXISTS`) aplicada vía CI al merge; borrado de código muerto residual (scanner BCBP, schema de ingreso, i18n huérfano); reconciliación de usuarios de prod vía `reset-test-users` con override; actualización de docs.

**Tech Stack:** PostgreSQL (Supabase) · Next.js 15 / TypeScript · next-intl · Zod · Vitest · pnpm.

**Spec:** `docs/superpowers/specs/2026-06-13-remocion-vuelos-afluencia-recepcion-design.md`

**Branch:** continuar en `chore/limpieza-codigo-muerto` (extiende el PR de limpieza; comparte `messages/*.json` para evitar conflictos).

---

## Estructura de archivos

| Archivo                                                                    | Acción                | Responsabilidad                                                                                                                     |
| -------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260613000000_remove_vuelos_afluencia_recepcion.sql` | Crear                 | Drop idempotente de tablas/vistas/MV/funciones de vuelos+afluencia+recepción+chat; recrear `refresh_analytics_views`; comentar enum |
| `apps/web/src/lib/scanner/` (dir)                                          | Borrar                | Parser BCBP sin uso vivo                                                                                                            |
| `packages/shared-validation/src/index.ts`                                  | Modificar             | Quitar `registrarIngresoSchema` + tipo `RegistrarIngresoInput`                                                                      |
| `packages/shared-validation/src/tests/schemas.test.ts`                     | Modificar             | Quitar import + `describe('registrarIngresoSchema')`                                                                                |
| `apps/web/src/messages/es.json` · `en.json`                                | Modificar             | Quitar `analytics.flights` + claves COGS/pasajeros; ajustar `pageSubtitle`                                                          |
| `scripts/reset-test-users.mjs`                                             | Modificar             | Añadir `recepcion@dorado.test` a `LEGACY_EMAILS`                                                                                    |
| `scripts/validate-test-users.mjs`                                          | Conservar (ya creado) | Validador read-only del set canónico                                                                                                |
| `CLAUDE.md`                                                                | Modificar             | Quitar fila del rol `recepcion`                                                                                                     |
| `ARCHITECTURE.md`                                                          | Modificar             | Marcar como ELIMINADO vuelos/afluencia/COGS-por-pasajero                                                                            |

---

## Task 1: Migración SQL de remoción

**Files:**

- Create: `supabase/migrations/20260613000000_remove_vuelos_afluencia_recepcion.sql`
- Reference: `supabase/migrations/20260528000000_remove_vuelos_afluencia_snack_buffet.sql` (espejo), `supabase/migrations/20260609000004_remove_chat.sql` (manejo de dependientes de `mensajes_chat`)

- [ ] **Step 1: Leer la migración de chat para reproducir el manejo de dependientes**

Run: `sed -n '1,80p' supabase/migrations/20260609000004_remove_chat.sql`
Objetivo: confirmar qué objetos dependen de `mensajes_chat` (políticas RLS, índices, la vista `v_retencion_estado`) para ordenar los DROP. Si aparece algún dependiente no contemplado abajo, añadir su `DROP ... IF EXISTS` antes del `DROP TABLE`.

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/20260613000000_remove_vuelos_afluencia_recepcion.sql` con exactamente:

```sql
-- =============================================================================
-- Remoción definitiva: vuelos, afluencia (recepción / registro de pasajeros) y
-- el residuo del módulo chat. Forward idempotente — NO toca snack/buffet
-- (features vigentes). Decisión del dueño 2026-06-13.
-- Spec: docs/superpowers/specs/2026-06-13-remocion-vuelos-afluencia-recepcion-design.md
--
-- Nota: el enum user_role NO puede perder el valor 'recepcion' sin recrear el
-- tipo (riesgoso por users.role + RLS). Queda INERTE y documentado.
-- =============================================================================

BEGIN;

-- ── 1. Vistas seguras por tenant (dependen de las MV a eliminar) ─────────────
DROP VIEW IF EXISTS public.v_cogs_per_passenger_tenant;
DROP VIEW IF EXISTS public.v_ocupacion_diaria_tenant;
DROP VIEW IF EXISTS public.v_pasajeros_turno;

-- ── 2. Materialized views de afluencia / cogs por pasajero ───────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_cogs_per_passenger;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ocupacion_diaria;

-- ── 3. Funciones de refresh de ocupación (ya sin MV destino) ─────────────────
DROP FUNCTION IF EXISTS public.refresh_ocupacion_diaria();
DROP FUNCTION IF EXISTS public.refresh_ocupacion_diaria_initial();

-- ── 4. refresh_analytics_views: dejar solo consumo ───────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_consumo_vs_produccion_turno;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_analytics_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_views() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_views() TO service_role;

-- ── 5. Retención: ambas tablas objetivo (afluencia_ingresos, mensajes_chat)
-- desaparecen. Se elimina la vista de estado + la función de purga y se
-- des-agenda cualquier job pg_cron asociado.
DROP VIEW IF EXISTS public.v_retencion_estado;
DROP FUNCTION IF EXISTS public.fn_purgar_afluencia_antigua();

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job
           WHERE command ILIKE '%fn_purgar_afluencia_antigua%'
              OR command ILIKE '%v_retencion_estado%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN NULL;
END $$;

-- ── 6. Tablas de los módulos eliminados ──────────────────────────────────────
DROP TABLE IF EXISTS public.pasajeros_ingreso;
DROP TABLE IF EXISTS public.afluencia_ingresos;
DROP TABLE IF EXISTS public.vuelos_snapshots;
DROP TABLE IF EXISTS public.aircraft_capacity;
DROP TABLE IF EXISTS public.buffet_tickets_turno;
DROP TABLE IF EXISTS public.mensajes_chat;

-- ── 7. Enum user_role: 'recepcion' inerte (no DROP VALUE) ────────────────────
COMMENT ON TYPE public.user_role IS
  'recepcion es un valor INERTE desde 2026-06-13 (remoción del rol recepción). No asignar.';

COMMIT;
```

- [ ] **Step 3: Validación de sintaxis local (sin DB)**

Run: `grep -c "IF EXISTS" supabase/migrations/20260613000000_remove_vuelos_afluencia_recepcion.sql`
Expected: `>= 13` (todos los DROP de objetos usan IF EXISTS).
Run: `grep -c "BEGIN;\|COMMIT;" supabase/migrations/20260613000000_remove_vuelos_afluencia_recepcion.sql`
Expected: `2` (transacción balanceada).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260613000000_remove_vuelos_afluencia_recepcion.sql
git commit -m "feat(db): migración de remoción vuelos/afluencia/recepción/chat (idempotente)"
```

> Verificación real: **Supabase Preview** en CI valida que aplica sin error (gate antes del merge). Pérdida de datos en prod ocurre al merge — autorizada por el dueño.

---

## Task 2: Borrar parser BCBP (lib/scanner)

**Files:**

- Delete: `apps/web/src/lib/scanner/parse-bcbp.ts`, `apps/web/src/lib/scanner/use-document-scanner.ts`, `apps/web/src/lib/scanner/scanner.test.ts` (y cualquier otro en el dir)

- [ ] **Step 1: Confirmar cero importadores vivos**

Run: `grep -rln "lib/scanner\|parse-bcbp\|use-document-scanner\|parseBcbp\|useDocumentScanner" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "src/lib/scanner/"`
Expected: sin resultados. Si aparece algún importador, **detenerse** y reportar (no estaba en el alcance auditado).

- [ ] **Step 2: Borrar el directorio**

```bash
git rm -r apps/web/src/lib/scanner
```

- [ ] **Step 3: Verificar typecheck + tests**

Run: `pnpm --filter apps/web typecheck && pnpm --filter apps/web test`
Expected: PASS (los tests de scanner desaparecen con el dir; el resto verde).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(limpieza): borrar parser BCBP (lib/scanner) — sin uso tras remoción de vuelos"
```

---

## Task 3: Quitar registrarIngresoSchema de shared-validation

**Files:**

- Modify: `packages/shared-validation/src/index.ts` (líneas ~268-316: `registrarIngresoSchema` + `RegistrarIngresoInput`)
- Modify: `packages/shared-validation/src/tests/schemas.test.ts` (import línea 16, `describe('registrarIngresoSchema')` líneas ~265-290)

- [ ] **Step 1: Ver el bloque exacto del test antes de borrar**

Run: `sed -n '263,292p' packages/shared-validation/src/tests/schemas.test.ts`
Objetivo: ubicar el `describe('registrarIngresoSchema', () => { ... })` completo para borrarlo sin dejar llaves colgando.

- [ ] **Step 2: Borrar el `describe` y el import en el test**

Quitar de `schemas.test.ts`:

- En el import (línea ~16): la línea `  registrarIngresoSchema,`
- El bloque completo `describe('registrarIngresoSchema', () => { ... });` (incluida su llave/`)` de cierre).

- [ ] **Step 3: Borrar el schema y el tipo en index.ts**

Quitar de `packages/shared-validation/src/index.ts`:

- El bloque `export const registrarIngresoSchema = z.object({ ... });` (líneas ~268-276).
- La línea `export type RegistrarIngresoInput = z.infer<typeof registrarIngresoSchema>;` (línea ~316).

- [ ] **Step 4: Confirmar que no quedan referencias**

Run: `grep -rn "registrarIngresoSchema\|RegistrarIngresoInput" packages apps`
Expected: sin resultados.

- [ ] **Step 5: Verificar typecheck + tests del paquete**

Run: `pnpm --filter @dorado/shared-validation test && pnpm --filter @dorado/shared-validation typecheck`
Expected: PASS.
(Si el filtro por nombre falla, usar `pnpm --recursive --if-present test`.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore(limpieza): quitar registrarIngresoSchema (registro de pasajeros) de shared-validation"
```

---

## Task 4: Limpieza i18n (flights + cogs/pasajeros)

**Files:**

- Modify: `apps/web/src/messages/es.json`
- Modify: `apps/web/src/messages/en.json`

- [ ] **Step 1: Confirmar que las claves candidatas son huérfanas**

Run (para cada clave candidata):

```bash
grep -rn "cogsTitle\|kpiTotalPasajeros\|kpiTotalPasajerosDesc\|kpiCogsTotal\|kpiCogsTotalDesc\|kpiCogsPorPasajero\|kpiCogsPorPasajeroDesc\|cogsEmpty\|colPasajeros\|colCogsTotal\|colCogsPorPasajero\|colTenant\|colTurno\|colInicio\|colEstado\|estadoActivo\|estadoCerrado\|analytics\.flights\|'flights'\|\"flights\"" apps/web/src --include="*.ts" --include="*.tsx"
```

Expected: sin resultados (todas huérfanas). `analytics-panel.tsx` solo usa `aplicarFiltros, consumoTitle, desde, hasta, refrescarVistas, turno, turnoPlaceholder`. **Conservar** las claves de consumo (`consumoTitle`, `consumoEmpty`, `colInsumo`, etc.) que sí se usen. Si alguna candidata aparece usada, **excluirla** del borrado.

- [ ] **Step 2: Editar `es.json`**

- Borrar el sub-objeto **`"flights": { ... }`** completo dentro de `analytics` (apertura `"flights": {` ~línea 594, cierre `}` ~línea 659). Cuidar la coma del elemento anterior (`"tenantGlobal": "global"` → su bloque cierra; `flights` es el último antes de cerrar `analytics`, así que al borrarlo no debe quedar coma colgante).
- Borrar las claves COGS/pasajeros huérfanas confirmadas en Step 1 dentro de `analytics`.
- Cambiar `"pageSubtitle": "COGS por pasajero y consumo vs producción por turno"` → `"pageSubtitle": "Consumo vs producción por turno"`.

- [ ] **Step 3: Editar `en.json` (espejo)**

Aplicar exactamente las mismas remociones/ajuste en `en.json` (mismas claves; `flights` ~línea 535, `cogsTitle` ~337). El `pageSubtitle` en inglés pasa a `"Consumption vs production by shift"` (mantener el estilo de la traducción existente; verificar el valor actual con `grep -n '"pageSubtitle"' apps/web/src/messages/en.json`).

- [ ] **Step 4: Verificar JSON válido + simetría es↔en**

Run:

```bash
node -e '
const fs=require("fs");
const es=JSON.parse(fs.readFileSync("apps/web/src/messages/es.json","utf8"));
const en=JSON.parse(fs.readFileSync("apps/web/src/messages/en.json","utf8"));
const flat=(o,p="")=>Object.entries(o).flatMap(([k,v])=>{const n=p?p+"."+k:k;return v&&typeof v==="object"&&!Array.isArray(v)?flat(v,n):[n];});
const ke=new Set(flat(es)),kn=new Set(flat(en));
const a=[...ke].filter(k=>!kn.has(k)),b=[...kn].filter(k=>!ke.has(k));
console.log("es:",ke.size,"en:",kn.size,a.length||b.length?("ASIM:"+JSON.stringify([...a,...b])):"SIMÉTRICO");
'
```

Expected: `SIMÉTRICO` y ambos counts iguales. Además: `grep -c "flights\|cogsTitle\|kpiTotalPasajeros" apps/web/src/messages/es.json` → `0`.

- [ ] **Step 5: Lint**

Run: `pnpm --filter apps/web lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/messages/es.json apps/web/src/messages/en.json
git commit -m "chore(i18n): quitar claves huérfanas de vuelos/afluencia/COGS-por-pasajero"
```

---

## Task 5: reset-test-users — purgar usuario recepcion

**Files:**

- Modify: `scripts/reset-test-users.mjs` (constante `LEGACY_EMAILS`, ~línea 62)
- Keep: `scripts/validate-test-users.mjs` (ya creado; añadir al repo)

- [ ] **Step 1: Añadir el email legacy**

En `scripts/reset-test-users.mjs`, cambiar:

```js
const LEGACY_EMAILS = ['admin@dorado.test', 'pipe@gisat.com']; // se borran si reaparecen
```

por:

```js
const LEGACY_EMAILS = ['admin@dorado.test', 'pipe@gisat.com', 'recepcion@dorado.test']; // se borran si reaparecen
```

- [ ] **Step 2: Verificar que el set canónico no contiene recepcion (debe seguir en 12)**

Run: `grep -c "tenantSlug: TENANT_OPERATIVO_SLUG" scripts/reset-test-users.mjs`
Expected: `12` (sin cambios — recepcion nunca estuvo en el set canónico).

- [ ] **Step 3: Añadir el validador al repo**

```bash
git add scripts/reset-test-users.mjs scripts/validate-test-users.mjs
git commit -m "chore(test-users): purgar usuario recepcion (LEGACY) + validador read-only del set canónico"
```

> La ejecución real de `reset:test-users` contra prod ocurre en Task 8 (post-merge, gated).

---

## Task 6: Documentación

**Files:**

- Modify: `CLAUDE.md` (línea 63: fila `recepcion`)
- Modify: `ARCHITECTURE.md` (secciones vuelos/afluencia/COGS-por-pasajero)

- [ ] **Step 1: Quitar la fila del rol recepcion en CLAUDE.md**

Borrar la línea 63 completa:

```
| `recepcion`            | —                   | Rol operativo — UI pendiente (K2)                                                                            |
```

- [ ] **Step 2: Marcar como ELIMINADO en ARCHITECTURE.md**

Run primero: `grep -n "vuelos\|afluencia\|cogs_per_passenger\|cash_outflow_per_passenger\|v_pasajeros_turno\|Affluence\|FLIGHTS" ARCHITECTURE.md`
Para cada bloque/sección de vuelos (2.11 API de vuelos), COGS/cash por pasajero (vistas ~977-996), y nodos de diagrama de afluencia (`AFL`, `WEB -->|consulta vuelos| FLIGHTS`): reemplazar el contenido por una nota:

```
> ELIMINADO (remoción 2026-06-13): vuelos / afluencia / COGS-por-pasajero — fuera del alcance operativo. Ver docs/superpowers/specs/2026-06-13-remocion-vuelos-afluencia-recepcion-design.md
```

No reescribir los ADRs históricos; solo anexar la nota de remoción donde se describan estos módulos como vigentes.

- [ ] **Step 3: Confirmar que no queda recepcion-como-rol en docs core**

Run: `grep -n "recepcion\|recepción" CLAUDE.md | grep -vi "recepción de\|en recepción\|merma"`
Expected: sin resultados (las menciones restantes son "recepción de inventario", que se conservan).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md
git commit -m "docs: remover rol recepción del mapa + marcar vuelos/afluencia como eliminados"
```

---

## Task 7: Verificación integral + actualizar PR

**Files:** ninguno (verificación)

- [ ] **Step 1: Suite completa**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: todo verde.

- [ ] **Step 2: Grep de remanentes vivos**

Run:

```bash
grep -rin "vuelo\|afluencia\|bcbp\|pasajeros_ingreso\|registrarIngreso\|aircraft\|ocupacion_diaria\|cogs_per_passenger" apps/web/src packages --include="*.ts" --include="*.tsx" | grep -vi "qr\|pasajero anónimo\|menú"
```

Expected: sin resultados vivos (las menciones de `/qr` de pasajeros se conservan y no deben aparecer aquí; si aparecen, revisar contexto).

- [ ] **Step 3: Push y actualizar el PR**

```bash
git push
gh pr edit 20 --title "chore: limpieza + remoción definitiva de vuelos/afluencia/recepción" \
  --body "Incluye la limpieza inicial (i18n nav, seed-test-users) + la remoción de vuelos, afluencia, registro de pasajeros (recepción), rol recepcion y residuo de chat. Spec: docs/superpowers/specs/2026-06-13-remocion-vuelos-afluencia-recepcion-design.md"
```

- [ ] **Step 4: Esperar CI verde (incluido Supabase Preview)**

Run: `gh pr checks 20`
Expected: todos `pass`. Si **Supabase Preview** falla por una dependencia no contemplada en la migración, volver a Task 1 Step 2 y añadir el `DROP ... IF EXISTS` o `CASCADE` que el log indique.

---

## Task 8: Aplicar en prod + reconciliar usuarios (post-merge, MANUAL/GATED)

> **No ejecutar hasta que el dueño apruebe el merge.** Pérdida de datos irreversible.

- [ ] **Step 1: Merge del PR (aplica la migración vía CI a prod)**

```bash
gh pr merge 20 --squash --delete-branch
```

- [ ] **Step 2: Verificar que la migración aplicó en prod (tablas ya no existen)**

Run: `node --env-file=apps/web/.env.local scripts/validate-test-users.mjs` (read-only; primero confirma conectividad) y un probe de tablas:

```bash
node --env-file=apps/web/.env.local -e '
const {createRequire}=require("node:module");const req=createRequire(process.cwd()+"/apps/web/package.json");
const {createClient}=req("@supabase/supabase-js");
const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
(async()=>{for(const t of ["pasajeros_ingreso","afluencia_ingresos","vuelos_snapshots","aircraft_capacity","buffet_tickets_turno","mensajes_chat"]){
  const {error}=await a.from(t).select("*",{count:"exact",head:true});
  console.log((error?"✓ eliminada":"✗ AÚN EXISTE").padEnd(14),t);}})();'
```

Expected: las 6 tablas reportan `✓ eliminada`.

- [ ] **Step 3: Reconciliar el set canónico de usuarios (purga recepcion, recrea soushef/buffet)**

```bash
ALLOW_PRODUCTION_RESET=yes_i_know pnpm reset:test-users
```

Expected: log con `🗑 recepcion@dorado.test`, `✨ sous_chef ...`, `✨ personal_buffet ...`, y "Creados/Reseteados" sin errores.

- [ ] **Step 4: Validar el set final**

Run: `node --env-file=apps/web/.env.local scripts/validate-test-users.mjs`
Expected: `✅ TODOS los 12 canónicos OK` y `Auth users fuera del set canónico: (ninguno)`.

---

## Self-Review (cobertura del spec)

- §1 DB → Task 1 ✅ · §2 código (scanner) → Task 2 ✅ · §2 (registrarIngreso) → Task 3 ✅ · §2 (i18n) → Task 4 ✅ · §3 usuarios → Task 5 (cambio) + Task 8 (ejecución) ✅ · §4 docs → Task 6 ✅ · §5 no-tocar → respetado (sin tasks sobre /qr, inventario, chef/steward) ✅ · criterios de aceptación → Task 7 + Task 8 ✅.
- Sin placeholders: cada paso tiene código/SQL/comando concreto.
- Consistencia de nombres: `recepcion@dorado.test`, `refresh_analytics_views`, `mv_consumo_vs_produccion_turno`, `LEGACY_EMAILS` usados igual en todas las tareas.
