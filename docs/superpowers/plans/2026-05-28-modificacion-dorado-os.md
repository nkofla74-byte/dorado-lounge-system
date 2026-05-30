# Refoco Operacional Dorado Lounge — Plan Maestro (v2, modelo autoritativo)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Refocar de ERP a plataforma operacional: bodega → 4 KDS → trazabilidad en tiempo real → métricas. El núcleo es el ruteo zona→área, el KDS por área y la trazabilidad de tiempos.

**Estado (2026-05-28):** typecheck exit 0 · 291 tests verdes · rama `feature/refoco-operacional`. Commits: remoción vuelos/afluencia/snack/buffet (`df873ba`), docs (`4e751cf`). Migración destructiva `20260528000000` NO aplicada (gate en merge a main).

---

## Modelo de negocio autoritativo (confirmado por el dueño 2026-05-28)

**Áreas productoras (KDS):** Almacén · Cocina Caliente · Cocina Fría · Pastelería · Cocina AMEX.
**Líneas de consumo (orígenes de pedido):** AMEX (sala) · Snack · Buffet.

**Matriz de ruteo zona→área (un pedido se rutea POR PRODUCTO al área correcta; un pedido puede tocar varias áreas):**

| Zona origen     | Áreas destino permitidas                   |
| --------------- | ------------------------------------------ |
| AMEX (sala)     | cocina_fria · cocina_amex                  |
| Snack           | cocina_caliente · cocina_fria · pasteleria |
| Buffet          | cocina_caliente · cocina_fria · pasteleria |
| **cocina_amex** | sirve EXCLUSIVAMENTE a AMEX                |

**Flujo:** la zona solicita → el área recibe en su KDS → elabora → al registrar producción el sistema **descuenta del almacén vía FEFO** (Principio Rector). Recepción→elaboración→despacho, todo por KDS.

**Decisiones de modelo confirmadas:**

- **Merma → por insumo, una vez.** `insumos.merma_default` (ya existe) pasa a ser la fuente AUTORITATIVA del cálculo de bruto/FEFO. Las recetas la heredan; se elimina la semántica de override independiente en `receta_ingredientes.merma_coeficiente`.
- **Unidades → solo `g` y `ml`.** Reducir el enum `unidad_medida`; todo se registra y calcula en gramos (sólidos) / ml (líquidos). Migrar valores existentes kg/l/lb/unidad/porcion → g/ml.
- **QR de mesas AMEX se conserva.** **Chat se elimina** (como snack/buffet).
- **Snack/Buffet**: sin módulo de inventario propio; se rehacen como interfaces de _origen de pedido_ a las cocinas.

---

## Fases ya cerradas / deprioritizadas

- **Remoción (Fase 1):** ✅ commiteada. Pendiente: aplicar migración destructiva al merge (gate del dueño).
- **Auditoría enterprise:** ✅ esencialmente resuelta (`20260527000000_enterprise_audit_fixes.sql` + commit `e7722df`). Remanentes, baja prioridad: **C-18** (desacoplar cocina-amex vía shared-types), **A-27** (GDPR borra PII), **DevOps manual** (secretos/pinning/backup cifrado). NO bloquean el núcleo.
- **Eliminar módulo chat:** cleanup análogo a snack/buffet. Queued, no bloquea.

---

## NÚCLEO — Fundaciones (orden obligatorio, son la base del ruteo)

### F1 — Split `AreaProduccion` caliente/fría

**Files:** `packages/shared-types/src/enums.ts` · nueva migración `*_area_produccion_split.sql` · `apps/web/src/messages/{es,en}.json`

- [ ] Añadir `cocina_caliente`, `cocina_fria` al enum TS `AreaProduccion` y al enum SQL `public.area_produccion` (ALTER TYPE ADD VALUE IF NOT EXISTS — `cocina` queda INERTE, nunca DROP VALUE).
- [ ] Tests de enum (shared-types) verde. Añadir i18n de los dos valores nuevos.
- [ ] Las recetas ya tienen `areaProduccion` (nullable) — sin cambio de columna; sólo el dominio admite los nuevos valores.
- **Criterio:** enum expone los 4 destinos productivos; typecheck + tests verdes.

### F2 — Estandarización a g/ml/unidad ✅

> REVISADO 2026-05-30: el dueño decidió mantener `unidad` para insumos contables
> ("por unidades solamente"). Enum final `{g, ml, unidad}` — no "solo g/ml".

**Files:** migración `20260530000000_unidades_g_ml.sql` · `enums.ts` (`UnidadMedida`) · `shared-validation` · `lib/units.ts` · selectores UI · messages es/en

- [x] Migración: convertir datos existentes (kg→g ×1000, lb→g ×453.59237, l→ml ×1000) en `insumos`, `lotes` (cantidades + peso_unitario), `receta_ingredientes`. `unidad`/`porcion` no se convierten (aguacate intacto; no hay porcion). Idempotente, enum SQL inerte.
- [x] Reducir enum TS+Zod a `{g, ml, unidad}`. Valores kg/lb/l/porcion quedan inertes en el tipo SQL (regla no-DROP).
- [x] `lib/units.ts` reducido (familias de 1 miembro); selectores UI y messages solo g/ml/unidad.
- **Criterio:** ✅ typecheck + lint + 394 tests verdes. SQL se verifica en CI; aplica al merge.

### F3 — Merma autoritativa en insumo

**Files:** `inventory/domain/merma.ts` · `recipes/*` · migración de datos

- [ ] El cálculo `bruto = requerida/(1-coef)` usa `insumos.merma_default` como coeficiente autoritativo.
- [ ] `receta_ingredientes.merma_coeficiente` deja de ser override: se sincroniza/deriva del insumo (o se ignora en el descuento). Migrar datos: poblar `merma_default` desde el valor de receta cuando falte.
- [ ] Mantener coverage 90%+ en `merma.ts`. Tests de que el descuento usa la merma del insumo.
- **Criterio:** un cambio de merma del insumo se refleja en todas sus recetas; tests verdes.

---

## NÚCLEO — Ruteo y trazabilidad

### R1 — Matriz de ruteo + `routeToKds`

**Files:** `packages/shared-types/src/` (matriz `ZONA_AREAS_PERMITIDAS`) · `orders/domain/routing.ts` · tests

- [ ] Constante autoritativa `ZONA_AREAS_PERMITIDAS: Record<ZonaServicio, AreaProduccion[]>` con la matriz de arriba.
- [ ] `routeToKds(item): AreaProduccion` deriva el área del `areaProduccion` de la receta del item.
- [ ] `assertZonaPuedeSolicitar(zona, area)`: valida que la zona solo pida a sus áreas permitidas; viola → error de dominio.
- [ ] Test exhaustivo: cada zona × cada área (permitida/denegada); pedido mixto se reparte por área.
- **Criterio:** un pedido de Snack con item caliente + item de pastelería genera destinos {cocina_caliente, pasteleria}; un pedido AMEX no puede rutear a cocina_caliente.

### R2 — Persistir destino + campos de trazabilidad en pedido

**Files:** migración aditiva `*_pedido_trazabilidad.sql` · `orders/domain/pedido.ts` · `orders/application/create-pedido.ts` · `enums.ts` (`Prioridad`)

- [ ] `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS prioridad smallint NOT NULL DEFAULT 3`, `cocinero_id uuid REFERENCES auth.users(id)`. (El destino por-item vive en `pedido_items.area_produccion`.)
- [ ] `pedido_items ADD COLUMN area_produccion public.area_produccion` poblado por `routeToKds` al crear.
- [ ] Enum `Prioridad` (alta/normal/baja). Persistir en create-pedido.
- **Criterio:** al crear, cada item queda ruteado a su área; tests de dominio.

### R3 — Eventos enriquecidos + asignación de cocinero + tiempo real

**Files:** `orders/actions.ts` · `cocina-amex` (patrón a replicar) · `packages/shared-types/src/socket-events.ts`

- [ ] Action `asignarCocinero(pedidoId, cocineroId)` con assertCan + auditLog + evento + broadcast.
- [ ] Confirmar persistencia-primero (evento en DB antes del broadcast) en todas las transiciones.
- [ ] Timestamps completos (sección 4 redefinición) consultables: creación, recibido, en_preparacion, despachado, entregado.
- **Criterio:** historial completo por pedido; KDS refleja en vivo.

---

## NÚCLEO — KDS por área e interfaces de origen

### K1 — KDS Cocina Caliente / Fría (funcionales)

**Files:** `apps/web/src/app/(dashboard)/cocina-caliente/*` · `cocina-fria/*` · módulo/queries de cola por área

- [ ] Pantalla por área: cola de pedidos ruteados a esa área (recepción → en_preparacion → despachado), timers, prioridad visible. Táctil, modo oscuro, i18n. Replicar patrón `cocina-amex`.
- **Criterio:** un pedido ruteado a cocina_caliente aparece en su KDS y avanza por estados con descuento FEFO al despachar.

### K2 — Interfaces de origen Snack / Buffet

**Files:** rutas `(dashboard)/snack`, `(dashboard)/buffet` (recrear como origen, no inventario) · usar `orders`

- [ ] Interfaz de mesero/encargado: tomar pedido y solicitarlo (crea pedido con `zona` = snack/buffet; ruteo automático a las áreas permitidas). 1–2 interfaces.
- **Criterio:** snack/buffet crean pedidos que llegan al KDS correcto; validación de matriz.

---

## NÚCLEO — Métricas operacionales en vivo (Fase 4)

### M1 — Vistas materializadas de tiempos

- [ ] `mv_tiempos_pedido` (total, cocina, espera) por área/cocinero/turno/hora. RLS vía vista `_tenant`. Refresh + pg_cron.
- [ ] `mv_productividad_cocinero`, `mv_flujo_operativo` (completados/hora, pendientes, retrasados, horas pico, saturación).

### M2 — Dashboard operativo en vivo

- [ ] Extender `analytics` (solo lectura) con queries a las vistas `_tenant`. Filtros: turno, área, responsable, período.
- [ ] Dashboard con KPIs en tiempo real (Socket.io), táctil, modo oscuro, i18n.

---

## Verificación (cada incremento)

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dorado/web test:e2e   # antes de cerrar K1/K2/M2
```

Migraciones idempotentes, aplicadas vía CI (nunca `supabase start`). Commits frecuentes en español. **Merge a main (aplica migración destructiva) requiere OK explícito del dueño.**

## Orden sugerido de ejecución

F1 → R1 (ya se puede testear el ruteo) → R2 → F2 → F3 → R3 → K1 → K2 → M1 → M2. Cleanups (chat, C-18, A-27) intercalados cuando convenga.
