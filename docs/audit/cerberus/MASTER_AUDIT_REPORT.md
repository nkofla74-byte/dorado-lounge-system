# MASTER AUDIT REPORT — Operación Cerberus

**Proyecto:** Dorado Lounge (SaaS multi-tenant, sala VIP aeroportuaria)
**Rama:** `feature/refoco-operacional` · **Fecha:** 2026-05-30
**Alcance:** Enjambre enfocado de 5 agentes (Arquitectura+Código muerto, Lógica de Negocio/Inventario, Seguridad, Base de Datos, QA/Cobertura).
**Modalidad:** auditoría del DELTA del "refoco operacional" sobre una base con auditoría enterprise previa ya resuelta.

> **Actualización 2026-05-30 (post-auditoría):** **C1, C2, C3 y C4 RESUELTOS.**
> C1/C2 en commit `ed2255f`; C3 (cocinero_id→`public.users` + validación de tenant en `asignarCocinero`) y C4 (RPC atómica `fn_crear_pedido`) en commit `caa104c`, validado contra prod por rollback. **Merge-blocker restante: C5** (cobertura rota + actions/RPC/RBAC/RLS sin tests).

> Honestidad brutal: el **núcleo de dominio está bien diseñado** (hexagonal enforced, FEFO atómico, merma-en-recepción correcta, 406 tests de dominio verdes). Pero el sprint de refoco dejó **regresiones críticas en migraciones** y una **capa de orquestación (actions/RPC) sin pruebas ni cobertura medida**. Dos críticos introducidos esta sesión **ya fueron corregidos**; el resto es merge-blocker pendiente.

---

## Hecho transversal que enmarca TODO

**Ninguna migración del refoco está aplicada en producción.** `schema_migrations` remoto va en `20260526200000`; las 7 migraciones del refoco (split área, trazabilidad, F2, F3 ×2, catálogo) aplican al merge vía CI. Implicación doble:

- **Bueno:** los críticos de migración se corrigen ANTES de tocar prod (ventana abierta).
- **Riesgo:** al hacer `supabase db push`, todo se aplica de golpe sobre el catálogo demo real. No mergear sin cerrar los merge-blockers de abajo.

---

## Scores por dominio (0–100)

| Dominio             |                    Score | Estado                                                          |
| ------------------- | -----------------------: | --------------------------------------------------------------- |
| Arquitectura        |                       82 | Sólido; penaliza refoco a medio cablear + 1 god-component       |
| Mantenibilidad      |                       80 | Deuda micro baja; frontera hexagonal limpia                     |
| Lógica de Negocio   | 62 → **~80 tras fix C1** | Motor correcto; fallaba la migración de costo                   |
| Seguridad           | 72 → **~85 tras fix C2** | Base robusta; regresión BOLA corregida                          |
| Base de Datos       |                       72 | RLS universal; FK mal apuntada + pedido no atómico              |
| Testing / Cobertura |                       58 | Dominio cubierto; actions/RPC/RBAC/RLS sin tests; coverage roto |
| Rendimiento         |            _no auditado_ | Fuera del alcance enfocado (sin agente dedicado)                |
| DevOps / SRE        |            _no auditado_ | Fuera del alcance (cubierto parcialmente en audit previo)       |
| Escalabilidad       |           ~75 (derivado) | Multi-tenant + RLS + socket desacoplado; ver DB-C2              |
| Calidad de Código   |           ~80 (derivado) | lint/typecheck verdes, TS strict, idioms consistentes           |

**Score global ponderado (dominios auditados): ~72/100** — “sólido con merge-blockers”.

---

## Matriz de riesgo consolidada

### 🔴 CRÍTICO

| ID     | Hallazgo                                                                                                                                            | Evidencia                                                                 | Impacto                                                                      | Estado                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **C1** | F2 escalaba cantidad kg/l→g ×1000 sin ajustar `costo_unitario` → costeo ×1000                                                                       | `20260530000000_unidades_g_ml.sql` (step 3)                               | Costos de receta 1000× inflados en todo lote kg/l/lb                         | ✅ **CORREGIDO** (commit ed2255f, verificado: valor de lote invariante) |
| **C2** | `CREATE OR REPLACE fn_costo_receta` (F3) eliminó el guard de tenant de `20260515000004` → BOLA cross-tenant en RPC `SECURITY DEFINER`               | `20260530000002_costo_receta_sin_merma.sql` vs `20260515000004:29-32`     | Cualquier `authenticated` lee costos/recetas/precios de otro tenant vía REST | ✅ **CORREGIDO** (commit ed2255f, guard re-incorporado)                 |
| **C3** | `cocinero_id uuid REFERENCES auth.users(id)` (sin tenant), mientras `responsable_id`→`public.users`. Asignación cross-tenant + joins inconsistentes | `20260528000002_pedido_trazabilidad.sql:25` · `orders/actions.ts:281-307` | Admin asigna cocinero de otro tenant; lecturas join fallan                   | ⏳ Pendiente (merge-blocker)                                            |
| **C4** | Creación de pedido = 2 INSERT no atómicos (pedido, luego ítems) sin transacción/RPC                                                                 | `orders/infrastructure/order-repository.ts:229-270`                       | Pedido huérfano sin ítems en cola KDS; no descuenta al entregar              | ⏳ Pendiente                                                            |
| **C5** | Cobertura no se genera (crash `vitest --coverage`) ni corre en CI; **0 tests** sobre `actions.ts` (2422 LOC), RPC FEFO real, `assertCan`/RBAC, RLS  | `ci.yml:146` · `vitest.config.ts` · ausencia de tests                     | Thresholds 75%/90% no protegen nada; rutas críticas sin red                  | ⏳ Pendiente                                                            |

### 🟠 ALTO

| ID  | Hallazgo                                                                                                                                                                  | Evidencia                                                      | Estado                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| A1  | Pantallas `cocina-fria`/`cocina-caliente` son stubs (sin `getPedidos`, sin KdsBoard, sin socket); el split F1 no tiene UID operativa y `kds-board.tsx` no filtra por área | `cocina-fria/page.tsx:16-24`, `cocina-caliente/page.tsx:22-23` | ⏳ WIP esperado (K1)                                           |
| A2  | El split de área deja recetas `area_produccion='cocina'` irruteables (no está en `ZONA_AREAS_PERMITIDAS`) → pedido rechazado; reclasificación “manual”                    | `20260528000001_area_produccion_split.sql`                     | ⏳ Pendiente (mitigado en tenant real por recarga de catálogo) |
| A3  | `costo_unitario numeric(14,2)` insuficiente para costos por gramo sub-céntimo; `costoUnitarioNeto` redondea a 4 dec. que la columna trunca a 2                            | `domain/merma.ts` · esquema lotes                              | ⏳ Pendiente (error de redondeo amplificado)                   |

### 🟡 MEDIO

- God-component QR (`qr-passenger-app.tsx`, 1379 líneas) con i18n hardcodeado (objeto `TEXTS`, 0 `useTranslations`) — viola regla CLAUDE.md; causa: next-intl solo cubre es/en, QR exige es/en/fr/pt.
- `asignarCocinero` persiste `cocineroId` del cliente sin validar tenant (FK limita alcance pero falta defensa).
- E2E frágiles: `test.skip(true,...)` incondicional + aserciones tautológicas (`pedido-lifecycle.spec.ts`, `auth.spec.ts`).
- `application/` parcial sin tests (recipes, superuser, etc.).

### 🟢 BAJO

- Lecturas de `users` con admin client sin `.eq('tenant_id', ...)` defensivo (`orders/actions.ts:533`, `cocina-amex-repository.ts:172`).
- Código muerto: `app/(dashboard)/turnos/` vacío; `scripts/fix-app-metadata.mjs` huérfano; `reset-users.mjs/.sql` superseded por `reset-test-users.mjs`.

**Verificado SIN regresión** (nota positiva): frontera hexagonal 0 violaciones · `fn_descontar_insumo_fefo` solo `service_role` · `SUPABASE_SERVICE_ROLE_KEY` solo en `lib/supabase/admin.ts` · ACL de canales socket nuevos correcta · remoción de vuelos/afluencia/snack/buffet limpia (sin imports rotos) · merma aplicada exactamente una vez (sin doble descuento) · FEFO idempotente.

---

## Roadmap

### ⏱️ Correcciones inmediatas (24 h) — merge-blockers

1. ✅ C1 costeo ×1000 (hecho).
2. ✅ C2 guard de tenant en `fn_costo_receta` (hecho).
3. **C3** — repuntar `cocinero_id` a `public.users(id)` + trigger/check de tenant (como `responsable_id`). Nueva migración aditiva.
4. **C4** — envolver creación de pedido+ítems en RPC atómica (patrón ya usado en `fn_completar_tanda`).

### 📅 Prioritarias (7 días)

5. **C5** — arreglar `vitest --coverage` (conflicto minimatch/glob), añadir `--coverage` a `ci.yml`, y primeros tests de integración de `actions.ts` críticos (descuento FEFO real, createLote+merma, transición de pedido con optimistic locking).
6. **A2** — migración que reclasifique recetas `'cocina'` → caliente/fría o las marque; impedir pedidos irruteables.
7. **A3** — decidir precisión de costo (¿`numeric(14,4)` para `costo_unitario`, o costo por kg/lote?).

### 🗓️ Importantes (30 días)

8. **A1/K1** — implementar KDS cocina caliente/fría reales (cola por área, filtro en `kds-board`, socket) — núcleo del refoco.
9. Tests de RBAC (`assertCan`/`permissions`) y pgTAP/políticas RLS.
10. Refactor god-component QR a next-intl (añadir fr/pt a messages).

### 🏗️ Refactor estratégico (90 días)

11. Cobertura de integración E2E del flujo operacional completo (recepción → KDS → despacho → costo/métricas).
12. Limpieza de código muerto y E2E frágiles; gate de cobertura real en CI.
13. Cerrar deuda enterprise remanente (C-18 desacople cocina-amex, A-27 GDPR) ya documentada.

---

## Informes por agente

- `ARCHITECTURE_REPORT.md` — Arquitectura + Código muerto (82/100)
- `BUSINESS_LOGIC_REPORT.md` — Inventario/Producción (62→~80/100)
- `SECURITY_REPORT.md` — Pentest delta (72→~85/100)
- `DATABASE_REPORT.md` — Esquema/Migraciones/RLS (72/100)
- `QA_REPORT.md` — Testing/Cobertura (58/100)

**Conclusión:** sistema con cimientos profesionales y un sprint de refoco bien encaminado pero **no listo para merge** hasta cerrar C3, C4 y el gap de testing (C5). Los dos críticos más peligrosos (C1 costeo, C2 fuga cross-tenant) ya están neutralizados en esta sesión.
