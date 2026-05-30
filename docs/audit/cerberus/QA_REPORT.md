# Operación Cerberus — AGENTE 07 · QA / Cobertura

**Proyecto:** Dorado Lounge System · Rama `feature/refoco-operacional`
**Fecha:** 2026-05-30 · **Método:** lectura + glob + ejecución de vitest/coverage (solo lectura)

---

## SCORE DE TESTING / COBERTURA: **58 / 100**

**Justificación:** El dominio puro está bien cubierto (406 tests verdes en todos los paquetes, invariantes críticas de merma y transiciones probadas). Pero hay tres agujeros estructurales que bajan el score drásticamente: (1) la generación de cobertura está **rota** y los thresholds **no se aplican en CI**; (2) **0 tests** sobre Server Actions, RPC FEFO real, RBAC y RLS — toda la superficie que toca Supabase y seguridad; (3) los flujos del refoco operacional (KDS por área cocina_fria/caliente, recepción con merma) **no tienen E2E**. La base de dominio salva el score de caer por debajo de 50.

---

## RESUMEN DE EJECUCIÓN (HECHO)

Tests ejecutados en modo lectura, todos verdes:

| Paquete                    | Test files | Tests   | Estado   |
| -------------------------- | ---------- | ------- | -------- |
| apps/web (vitest)          | 28         | 311     | PASS     |
| apps/socket-server         | 1          | 16      | PASS     |
| packages/shared-validation | 1          | 43      | PASS     |
| packages/shared-types      | 2          | 36      | PASS     |
| **TOTAL**                  | **32**     | **406** | **PASS** |

(El total "406" reportado coincide. 38 archivos `*.test/*.spec` incluyen los 6 E2E de Playwright, que no corren en vitest.)

---

## INVENTARIO DE TESTS POR MÓDULO (HECHO)

13 módulos en `apps/web/src/modules/`. Todos tienen `domain/` cubierto; **ninguno** tiene tests de `actions.ts` ni de `infrastructure/`.

| Módulo        | domain | application | infra | actions.ts | Tests existentes                                                                                  |
| ------------- | :----: | :---------: | :---: | :--------: | ------------------------------------------------------------------------------------------------- |
| inventory     |   ✅   |     ✅      |  ❌   |     ❌     | merma, fefo-concurrency (simulado), inventory-application                                         |
| orders        |   ✅   |     ✅      |  ❌   |     ❌     | routing, idempotency, optimistic-locking, pedido-transitions, tenant-isolation, order-application |
| production    |   ✅   |     ✅      |  ❌   |     ❌     | tanda-application, tanda-transitions                                                              |
| turnos        |   ✅   |     ✅      |  ❌   |     ❌     | turno-domain, turno-application                                                                   |
| proveedores   |   ✅   |     ✅      |  ❌   |     ❌     | proveedor-domain, proveedor-application                                                           |
| alertas       |   ✅   |      —      |  ❌   |     ❌     | alerta-domain, check-deduplication                                                                |
| cocina-amex   |   ✅   |     ❌      |  ❌   |     ❌     | cocina-amex-domain (solo domain)                                                                  |
| costos        |   ✅   |      —      |  ❌   |     ❌     | costo-domain                                                                                      |
| recipes       |   ✅   |     ❌      |  ❌   |     ❌     | recipe-domain (application sin test)                                                              |
| superuser     |   ✅   |     ❌      |  ❌   |     ❌     | superuser-domain (application sin test)                                                           |
| feature-flags |   ✅   |     ❌      |  ❌   |     ❌     | feature-flag-domain                                                                               |
| chat          |   ✅   |     ❌      |  ❌   |     ❌     | chat-domain                                                                                       |
| analytics     |   ✅   |     ❌      |  ❌   |     ❌     | kpi-domain                                                                                        |

Leyenda: ✅ con test · ❌ sin test · — no existe esa capa.

**Ratio:** 13 dominios con test / 13 = 100% dominio. **0 / 13** módulos con test de `actions.ts` (2422 LOC de Server Actions sin probar). **0 / ~30** archivos `application/` con cobertura directa más allá de inventory/orders/production/turnos/proveedores.

---

## HALLAZGOS

### CER-QA-01 · CRÍTICO · La cobertura NO se genera ni se aplica en CI

- **Evidencia (HECHO):**
  - `apps/web/vitest.config.ts:13-31` define `coverage` v8 con thresholds (global 75%, `merma.ts` 90%).
  - Ejecutar `npx vitest run --coverage` en `apps/web` **crashea** con `TypeError: (0 , brace_expansion_1.default) is not a function` en `minimatch@9.0.9` → `glob@10.5.0` → `test-exclude` → `@vitest/coverage-v8/provider.js:2636` (`getUntestedFiles`). **Exit code 1.**
  - `coverage/coverage-summary.json` **no se genera** (solo quedan los `.tmp/coverage-*.json` crudos).
  - `.github/workflows/ci.yml:146` corre `pnpm test`, que es `vitest run --passWithNoTests` (`apps/web/package.json`) **sin `--coverage`**. Root `package.json`: `"test": "pnpm --recursive --if-present test"`.
- **Impacto:** Los thresholds 75%/90% del CLAUDE.md **no protegen nada**. El claim "75% global, 100% en merma" es aspiracional, no verificado. Una regresión que borre tests de merma (Principio Rector) pasaría CI sin alarma. Si alguien añade `--coverage` al pipeline, el job crashea por el bug de dependencias.
- **Probabilidad:** ALTA (ya ocurre hoy).
- **Solución:** (1) Fijar la versión de `minimatch`/`brace-expansion` vía `pnpm.overrides` o actualizar `@vitest/coverage-v8` (incompatibilidad conocida brace-expansion ESM/CJS). (2) Añadir un job de CI que corra `pnpm --filter @dorado/web test -- --coverage` con fallo en threshold. (3) Mientras el report esté roto, marcar el claim del CLAUDE.md como "no verificado".

### CER-QA-02 · CRÍTICO · Cero tests sobre Server Actions, RPC FEFO real, RBAC y RLS

- **Evidencia (HECHO):**
  - Búsqueda `grep -rln "from.*actions" apps/web/src/modules/*/tests/` → **vacío**. Ningún test importa un `actions.ts`.
  - `fefo-concurrency.test.ts` importa solo `cantidadConMerma` y define un `createFEFOSimulator()` (línea 19): es una **reimplementación TS del FEFO**, no la RPC `fn_descontar_insumo_fefo`. CLAUDE.md declara esa RPC como la **única** fuente de descuento ("No reimplementar en TypeScript"). El test da falsa confianza: valida una copia, no el código de producción.
  - `fn_descontar_insumo_fefo` se invoca en `orders/actions.ts` e `inventory/actions.ts` — **ningún test** ejercita esas rutas.
  - RBAC: `lib/auth/assertCan.ts` (50 LOC) y `lib/auth/permissions.ts` (158 LOC, matriz de permisos) **no tienen archivo `.test.ts`**. `role-home.test.ts` no cubre `assertCan` (grep `assertCan` → 0 ocurrencias).
  - RLS / multi-tenancy: `find . -path '*test*' -name '*.sql'` → **vacío**. No hay pgTAP ni tests de políticas RLS, pese a que CLAUDE.md dice "Multi-tenancy enforza en Postgres, no en la app". `tenant-isolation.test.ts` valida aislamiento a nivel dominio, no RLS real.
- **Impacto:** Las rutas más sensibles (descuento de inventario atómico, autorización por rol, aislamiento entre tenants) no tienen red de seguridad automatizada. Un bug en la matriz de permisos o en una policy RLS llega a prod sin detección. El descuento FEFO real podría divergir del simulador probado.
- **Probabilidad:** MEDIA-ALTA (cambios en actions/permissions son frecuentes en este sprint de refoco).
- **Solución:** (1) Tests de integración de `actions.ts` con Supabase mockeado verificando `assertCan` + `auditLog` + llamada a la RPC correcta. (2) Suite de la matriz de `permissions.ts` (rol × permiso). (3) pgTAP o tests de integración contra una DB efímera para RLS y `fn_descontar_insumo_fefo`.

### CER-QA-03 · ALTO · Flujos del refoco operacional (R1-R3) sin E2E

- **Evidencia (HECHO):**
  - `apps/web/e2e/kds.spec.ts` (3 tests) prueba el tablero legacy de **tres columnas** ("Nuevos → En preparación → Despachado"); no menciona `cocina-fria`/`cocina-caliente` ni el ruteo por área.
  - Las pantallas nuevas del refoco son **stubs**: `cocina-fria/page.tsx` (27 líneas) y `cocina-caliente/page.tsx` (27 líneas). No hay E2E que las cubra.
  - El ruteo zona→área (R1-R3) solo tiene tests de dominio (`orders/tests/routing.test.ts`, 9 tests); el ruteo automático al KDS al crear pedido (commit R2b) y la asignación de cocinero (R3) viven en `actions.ts` → sin test (ver CER-QA-02).
  - La merma en recepción F3 (`aplicarMermaRecepcion`, `costoUnitarioNeto`) está bien cubierta en dominio (`merma.test.ts:140-198`), pero la **recepción de lote** que la aplica (`inventory/application/create-lote.ts` + `actions.ts`) no tiene test de aplicación/integración. Las migraciones `20260530000001_merma_recepcion.sql` y `..0002_costo_receta_sin_merma.sql` no tienen test de datos/conversión.
- **Impacto:** El corazón del pivote operacional (KDS por área, ruteo automático, merma en recepción end-to-end) no tiene verificación de integración ni de UI. Riesgo de que el flujo real falle aunque el dominio esté verde.
- **Probabilidad:** ALTA (código nuevo y stubs sin terminar).
- **Solución:** E2E para crear pedido → ruteo a cocina_fria/caliente → asignación cocinero, una vez las pantallas dejen de ser stubs. Test de aplicación para recepción de lote con merma.

### CER-QA-04 · MEDIO · Capa `application/` parcialmente sin cobertura

- **Evidencia (HECHO):** Tienen test de application solo inventory, orders, production, turnos, proveedores. **Sin test de application:** recipes (`create-recipe`, `add-ingrediente`, `get-recipes`), superuser (`create-tenant`, `create-user`), feature-flags, chat, analytics, cocina-amex, alertas.
- **Impacto:** Casos de uso de creación de tenant/usuario (superuser), recetas (clave para el Principio Rector) y alertas no validan su orquestación.
- **Probabilidad:** MEDIA.
- **Solución:** Tests de application por caso de uso priorizando recipes y superuser.

### CER-QA-05 · MEDIO · Tests E2E frágiles / con skip incondicional que ocultan falta de cobertura

- **Evidencia (HECHO):**
  - `e2e/pedido-lifecycle.spec.ts:14` → `test.skip(true, 'No hay botón de crear pedido — usuario sin permiso o UI diferente')`: skip **incondicional** que desactiva la validación del ciclo de pedido.
  - `e2e/pedido-lifecycle.spec.ts:108` → comentario "El test es exitoso si llegamos aquí sin errores de página": aserción **tautológica** (pasa por no-crash, no verifica resultado).
  - `e2e/auth.spec.ts:25` → `test.skip()` incondicional.
- **Impacto:** E2E que "pasan" sin probar el comportamiento real → falsa señal verde en el flujo crítico de pedidos AMEX.
- **Probabilidad:** ALTA (ya activo).
- **Solución:** Reemplazar skips incondicionales por aserciones reales o condiciones de skip basadas en estado; sustituir el "llegamos aquí sin error" por verificación de estado/UI.

### CER-QA-06 · BAJO · `coverage.include` limitado a dominio por diseño

- **Evidencia (HECHO):** `vitest.config.ts:18` → `include: ['src/modules/*/domain/**', 'src/lib/audit.ts', 'src/lib/result.ts']`. application/infrastructure/actions están **fuera** de la medición por decisión explícita.
- **Impacto:** El % de cobertura, aun cuando funcione (CER-QA-01), solo refleja dominio puro. Da una métrica optimista del sistema completo.
- **Probabilidad:** N/A (decisión de config).
- **Solución:** Documentar que la cobertura es "solo dominio"; considerar medir application una vez existan sus tests.

---

## NOTAS / HIPÓTESIS

- **HIPÓTESIS:** El crash de cobertura (CER-QA-01) probablemente ya existía antes del refoco (es un problema de versiones de `minimatch`/`brace-expansion` en el lockfile), pero como CI nunca corre `--coverage`, pasó inadvertido. Verificable revisando el lockfile.
- **HECHO:** No hay `.only` en ningún test (no hay riesgo de suite truncada por foco accidental).
- **HECHO:** El único `.skip` en unit/integration es un nombre de test (`optimistic-locking.test.ts:144` "transición exitosa" — falso positivo del grep, es texto, no `.skip`). Los skips reales están solo en E2E (CER-QA-05).

---

## TOP 3

1. **CER-QA-01 (CRÍTICO):** la cobertura está rota y los thresholds 75%/90% no se aplican en CI — el claim del CLAUDE.md no está verificado.
2. **CER-QA-02 (CRÍTICO):** 0 tests sobre Server Actions, RPC FEFO real, RBAC (`assertCan`/`permissions`) y RLS; el test FEFO valida un simulador TS, no la RPC de producción.
3. **CER-QA-03 (ALTO):** los flujos del refoco (KDS cocina_fria/caliente, ruteo automático, recepción con merma) no tienen E2E ni tests de integración; las pantallas nuevas son stubs.
