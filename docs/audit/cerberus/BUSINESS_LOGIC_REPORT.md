# OPERACIÓN CERBERUS — AGENTE 09: Auditoría de Inventario y Producción

**Fecha:** 2026-05-30 · **Rama:** `feature/refoco-operacional` · **Scope:** Compra → Recepción → Bodega → Producción → Recetas → Merma → Consumo → Ventas → Reportes
**Método:** lectura de código + migraciones + verificación de datos reales (Supabase, solo lectura, proyecto `gyewxgtuzjbxzcvcfmwy`, tenant `b03fab11-…`).

---

## SCORE LÓGICA DE NEGOCIO: 62 / 100

**Justificación.** El nuevo modelo de merma en recepción (F3) está implementado de forma **coherente y aplicada exactamente una vez** en todos los caminos de consumo — ese es el corazón del refoco y está bien resuelto (+). FEFO sigue siendo única fuente de descuento, atómico e idempotente (+). Pero la migración de unidades F2 contiene un **bug crítico de costos** (no reescala `costo_unitario` de kg/l→g, inflando el costo de receta ×1000), hay **pérdida de precisión sistemática** en costos por gramo derivada de `numeric(14,2)` + Zod 2-decimales, y la **divergencia teoría-vs-realidad es severa**: ninguna migración del refoco (F1–F3 + catálogo) está aplicada en la BD remota, que aún corre el catálogo demo con unidades kg/l. El motor es sólido; la migración de datos es el punto frágil.

| Eje                                 | Nota |
| ----------------------------------- | ---- |
| Modelo de merma (aplicación única)  | 9/10 |
| FEFO / idempotencia / atomicidad    | 9/10 |
| Costos (precisión + bug F2)         | 3/10 |
| Migración de datos (F2/F3/catálogo) | 4/10 |
| Coherencia código ↔ BD real         | 4/10 |

---

## HECHO TRANSVERSAL (contexto que enmarca todo)

**Las migraciones del refoco NO están aplicadas en la BD remota.**
Evidencia: `supabase_migrations.schema_migrations` — última versión aplicada = `20260526200000`. Las migraciones `20260528000000`…`20260530000003` (F1 split áreas, F2 unidades, F3 merma, catálogo real) están en el repo pero **no** en la BD.

Estado real de la BD (tenant Dorado Lounge):

- **35 insumos activos** con códigos demo (`INS-00001` Ahuyama, `INS-00003` Zanahoria, `zdxfyuhzdf76345` "harina"), **no** los 64 reales del catálogo (`00590`, `00211`, …). Unidades presentes: `g, kg, l, ml, unidad` → kg/l **siguen vivos**.
- **9 recetas activas demo** (Pollo Encocado, Crema de Ahuyama, …) que el catálogo iba a archivar. **43** `receta_ingredientes`, todos con `unidad_display = NULL` (heredan unidad base del insumo).
- `merma_default = 0` en los 35 insumos; 0 lotes con stock negativo; 0 insumos sin lote con stock.

Implicación: la auditoría evalúa **código que aún no se ha ejecutado contra los datos que pretende migrar**. Los bugs de migración de datos abajo se dispararán **en el `supabase db push` del refoco**, sobre datos demo reales (no sobre el catálogo limpio). El estado "0 recetas activas" descrito en el brief es el estado _esperado tras aplicar_ el catálogo — hoy hay 9 recetas demo vivas.

---

## HALLAZGOS

### H-01 · CRÍTICO · F2 no reescala `costo_unitario` kg/l→g ⇒ costo de receta inflado ×1000

**Evidencia.** `supabase/migrations/20260530000000_unidades_g_ml.sql:51-84`. El paso 3 multiplica la **cantidad** del lote ×1000 (kg/l) / ×453.59 (lb):

```sql
-- 3) Cantidades de lote …
UPDATE lotes l
SET cantidad_inicial = l.cantidad_inicial * 1000,
    cantidad_actual  = l.cantidad_actual * 1000
FROM insumos i WHERE i.id = l.insumo_id AND i.unidad_medida IN ('kg', 'l');
```

No existe **ningún** `UPDATE lotes SET costo_unitario = costo_unitario / 1000`. Los pasos 4 (peso_unitario) y 5 (insumo) tampoco tocan el costo. El comentario de cabecera (líneas 12-14) solo menciona "cantidades almacenadas… se reescalan" — el costo unitario quedó fuera del diseño.

**Verificación en datos reales** (los lotes que F2 procesaría): `Almidón de yuca` 100 l @ **50 000 COP/l**, `Zanahoria` 18.84 kg @ **8 500 COP/kg**, etc. Tras F2 quedarían como `100 000 ml @ 50 000 COP/ml` y `18 841 g @ 8 500 COP/g`.

**Impacto.** `fn_costo_receta` (20260530000002, líneas 67/83) calcula `costo = cantidad × costo_unitario`. Con cantidad en gramos y costo aún por-kg, **cada costo de ingrediente se infla por el factor de conversión (×1000 para kg/l, ×453.59 para lb)**. Un plato con 200 g de zanahoria costaría `200 × 8500 = 1 700 000 COP` en vez de `200 × 8.5 = 1 700 COP`. Esto contamina `costo_total`, `costo_por_porcion`, `cogs_per_passenger` y toda la analítica de costos. Es además inconsistente: la cantidad sube ×1000 pero el valor monetario total del lote también sube ×1000 (no se preserva `cantidad × costo = total`).

**Probabilidad.** Certeza (100%) si se aplica F2 sobre lotes kg/l/lb con costo — y hay 8 insumos kg/l con lotes costeados en la BD ahora mismo.

**Solución.** Añadir a F2, dentro del mismo `BEGIN`, antes/junto al paso 3:

```sql
UPDATE lotes l SET costo_unitario = round(l.costo_unitario / 1000.0, 2)
FROM insumos i WHERE i.id = l.insumo_id AND i.unidad_medida IN ('kg','l')
  AND l.costo_unitario IS NOT NULL;
UPDATE lotes l SET costo_unitario = round(l.costo_unitario / 453.59237, 2)
FROM insumos i WHERE i.id = l.insumo_id AND i.unidad_medida = 'lb'
  AND l.costo_unitario IS NOT NULL;
```

Cuidado con el orden/idempotencia: debe correr **antes** del paso 5 (que voltea `unidad_medida`), igual que el paso 3, para poder filtrar por la unidad de origen. (Ver también H-02: el redondeo a 2 decimales por-gramo puede colapsar a 0.)

---

### H-02 · ALTO · Pérdida de precisión de costo por gramo: `numeric(14,2)` + Zod `multipleOf(0.01)`

**Evidencia.**

- Columna: `supabase/migrations/20260503132217_0003_inventory_core.sql:86` → `costo_unitario numeric(14,2)`.
- Validación de entrada: `packages/shared-validation/src/index.ts:83-86` → `precioCopSchema = z.number().positive().multipleOf(0.01)` (exactamente 2 decimales), usado por `createLoteSchema.costoUnitario` (línea 113).
- Costo neto F3: `apps/web/src/modules/inventory/domain/merma.ts:92-103` `costoUnitarioNeto` redondea a **4** decimales, pero al persistir en `numeric(14,2)` se trunca a 2 (`inventory/actions.ts:322-334`).

**Impacto.** Con unidades en gramos, el costo unitario es un número pequeño (ej. Sal `7.34`, Zanahoria `1.47`, Pasta `9.88` COP/g del catálogo real). Insumos baratos por gramo pueden tener costos reales sub-céntimo (ej. arroz, azúcar a granel): `numeric(14,2)` los redondea y `multipleOf(0.01)` impide siquiera capturarlos con precisión. El error de redondeo por gramo se **multiplica por miles de gramos** al costear recetas → sesgo material en `cogs_per_passenger`. El `round(...,4)` de `costoUnitarioNeto` es además engañoso: sugiere 4 decimales que la columna descarta.

**Probabilidad.** Alta para insumos a granel de bajo costo unitario (varios en el catálogo real: azúcar 5.55, zanahoria 1.47, sal 7.34 — y futuros más baratos).

**Solución.** Subir la escala de `costo_unitario` a `numeric(14,4)` (o `(18,6)`) y relajar `precioCopSchema` a `multipleOf(0.0001)` para campos de costo unitario, conservando `(14,2)` solo para totales monetarios. Migración idempotente `ALTER COLUMN … TYPE numeric(14,4)`.

---

### H-03 · MEDIO · F3 netea por `MAX(merma_coeficiente)` — silencioso si un insumo tiene coeficientes distintos en recetas

**Evidencia.** `supabase/migrations/20260530000001_merma_recepcion.sql:27-32, 50-54`:

```sql
SELECT insumo_id, MAX(merma_coeficiente) AS coef
FROM receta_ingredientes WHERE merma_coeficiente > 0 GROUP BY insumo_id
```

El comentario (líneas 15-16) afirma "cada insumo tiene un único coeficiente en sus recetas, así que MAX es unívoco" — es una **suposición de datos no garantizada por el esquema**. `receta_ingredientes.merma_coeficiente` es por-fila; nada impide que el mismo insumo tenga 0.10 en una receta y 0.15 en otra.

**Impacto.** Si la suposición falla, F3 (a) escala el stock/costo del lote por el MAX y (b) fija `insumo.merma_default = MAX`, descartando silenciosamente el resto. El stock neto y el costo quedarían sesgados sin error ni traza. Hoy el riesgo es nulo (merma_default=0 en toda la Bda; sin merma>0), pero es deuda latente para cuando se carguen coeficientes reales.

**Probabilidad.** Baja hoy / media a futuro (el modelo F3 _subió_ la merma a propiedad del insumo, pero la migración la _deriva_ de un campo por-receta multivaluado).

**Solución.** Antes de poblar, detectar conflictos y fallar ruidosamente: `RAISE EXCEPTION` si `count(DISTINCT merma_coeficiente) > 1` por insumo. O documentar/forzar invariante con CHECK/constraint a nivel de captura.

---

### H-04 · MEDIO · `fn_costo_receta` y FEFO toman lotes de unidad heterogénea sin validar coherencia de unidad

**Evidencia.** `fn_costo_receta` (20260530000002:55-67) y `fn_descontar_insumo_fefo` (0008_rpcs.sql:99-148) operan sobre `lotes.cantidad_actual` / `costo_unitario` asumiendo que **todos** los lotes de un insumo y las cantidades de receta están en la **misma unidad base** que `insumo.unidad_medida`. No hay validación de que `receta_ingredientes.cantidad` y `lotes.cantidad_actual` compartan unidad.

**Impacto.** Durante la transición F2 (o si un lote viejo en kg coexiste con uno nuevo en g — escenario real si F2 se aplica parcial o si se crea un lote antes de F2), FEFO restaría "gramos" contra un saldo en "kg" → **doble/mil-veces descuento** o costo erróneo, sin que ninguna función lo detecte. El brief pide explícitamente vigilar "movimientos inconsistentes" y "doble descuento": este es el vector.

**Probabilidad.** Media durante la ventana de migración; baja en régimen estacionario (enum TS/Zod ya limita capturas nuevas a g/ml/unidad).

**Solución.** Tras F2, verificar que no queden lotes/`receta_ingredientes` en kg/l/lb (query de aserción post-migración). Idealmente, almacenar la unidad en el lote y validar contra la del insumo en FEFO.

---

### H-05 · BAJO · Catálogo real: ~17 insumos sin stock ni costo y flags de datos ambiguos

**Evidencia.** `supabase/migrations/20260530000003_catalogo_real_dorado.sql:35-107`. Filas con `stock=NULL, costo=NULL` (Harina de maíz 00802, Salsa inglesa 00551, Arroz Federal 00080, Pasta de tomate 00635, etc.) entran como insumo sin lote. Varias `[FLAG]` con datos dudosos: `00407 Queso mozzarella` "¿cantidad = kg?", `00875 Kumis` "2 L supuesto", `00220 Nachos`/`00803 Antipasto` "¿terminado?", `00571 Frugol` "unidad supuesta".

**Impacto.** (a) Con `merma_default=0` en todo el catálogo, F3 no aplica merma — correcto y esperado, pero **el inventario no descontará nada hasta crear recetas** (estado transitorio del brief). (b) Insumos sin lote → `fn_costo_receta` los marca `tiene_costo_completo=false` (correcto, no es bug). (c) Los `[FLAG]` con unidad/cantidad supuesta son riesgo de costo erróneo en la primera recepción real (ej. si "Queso mozzarella 5000" eran 5 kg vs 5000 g importa ×1000). No es bug de código; es deuda de datos a confirmar con el dueño antes de operar.

**Probabilidad.** N/A (calidad de dato).

**Solución.** Validar con operación los ~10 `[FLAG]` antes de registrar lotes; los insumos sin costo no deben usarse en recetas costeadas hasta tener lote.

---

## VALIDACIÓN DE LOS PUNTOS CLAVE DEL BRIEF

1. **¿Merma se aplica exactamente una vez? ¿Algún path infla en consumo o no netea en recepción?**
   **SÍ, exactamente una vez.** Recepción única: `inventory/actions.ts:310-349` (`createLote` netea cantidad y costo vía `aplicarMermaRecepcion`/`costoUnitarioNeto`; el movimiento de entrada registra la cantidad neta). Consumo neto-directo, sin reinflar, en **los tres** caminos:
   - AMEX entrega: `orders/actions.ts:404-418` (`cantidadNeta = cantidadPorBatch/porciones × cantidad`).
   - Producción/tandas: `production/actions.ts:123-129` (`cantidad_bruta = ing.cantidad × cantidadTandas`, sin `/(1-merma)`) → `fn_completar_tanda` → FEFO.
   - Stock Out / merma manual: `inventory/actions.ts:177-223 / 225-297` (descuentan la cantidad pasada directa).
     `cantidadConMerma`/`mermaAbsoluta` quedaron como utilidades puras no usadas en descuento/costo (`merma.ts:9-11`, solo en tests). **No detecté ningún path de doble merma ni de recepción sin netear.** El único riesgo de "doble descuento" es el de unidad heterogénea (H-04), no de merma.

2. **FEFO solo en SQL, idempotente, usado por todos los caminos.**
   Correcto. `fn_descontar_insumo_fefo` (0008_rpcs.sql) es atómico (`FOR UPDATE`), idempotente por `idempotency_key` (operaciones_idempotentes), revocado a PUBLIC, solo `service_role`. Llamantes con clave bien construida: stock_out (input), merma (input), pedido AMEX (`pedido:…:item:…:ing:…`, orders:407), tanda (`tanda:…:ing:…`, completar_tanda:40). Buffet/Snack **no** llaman FEFO directo (despachan vía tandas/pedidos) — consistente con el modelo. No reimplementado en TS.

3. **Costo coherente con lote neto.** `fn_costo_receta` (20260530000002) ya no infla por merma (`cantidad × costo_unitario` directo) — coherente con que el lote guarda costo neto. **PERO** ver H-01 (F2 rompe la coherencia de unidad del costo) y H-02 (`numeric(14,2)` pierde precisión por gramo).

4. **Migración de datos F3 correcta e idempotente.** El **netteo F3** sí preserva valor total (`cantidad ×(1-coef)`, `costo /(1-coef)`) y es idempotente (guarda por `merma_default=0`, paso 1 antes de paso 2). **El problema no es F3 sino F2**: F2 escala cantidad pero no costo (H-01). Como F2 corre antes que F3 (timestamp), F3 operaría sobre un costo ya erróneo.

5. **Catálogo.** 64 filas en el script (no "64 insumos" netos: incluye `GEN-001/002` sintéticos); ~17 sin stock/costo; merma 0 en todos. Ver H-05. Nota: en la BD real el catálogo **aún no está cargado** (35 insumos demo).

---

## RESUMEN EJECUTIVO

El motor operacional (merma-en-recepción única + FEFO atómico/idempotente + costo directo) está **bien diseñado y correctamente cableado**. El riesgo no está en el flujo de consumo sino en la **migración de datos**: F2 olvidó reescalar el costo unitario al pasar kg/l→g (H-01, ×1000 en costos), agravado por la precisión `numeric(14,2)` insuficiente para costos por gramo (H-02). Todo esto está **latente**: la BD remota sigue en el catálogo demo con unidades kg/l y ninguna migración del refoco aplicada. **Recomendación: NO ejecutar `supabase db push` del refoco hasta corregir H-01 y H-02**, porque se aplicarán sobre los lotes demo reales (8 insumos kg/l costeados) e inflarán los costos ×1000 de forma persistente.

---

### Top 3 hallazgos

1. **H-01 (CRÍTICO):** F2 `20260530000000_unidades_g_ml.sql` reescala la cantidad de lotes kg/l→g ×1000 pero **no** divide `costo_unitario` ⇒ `fn_costo_receta` infla el costo ×1000 (verificado: 8 lotes kg/l costeados en la BD real).
2. **H-02 (ALTO):** Costo por gramo en `numeric(14,2)` + Zod `multipleOf(0.01)` ⇒ pérdida de precisión sistemática (sub-céntimo) que se amplifica por miles de gramos en el costeo.
3. **H-04 (MEDIO) + Hecho transversal:** ninguna migración del refoco está aplicada (BD en `20260526200000`, catálogo demo con kg/l vivos); durante la ventana de migración, lotes de unidad heterogénea pueden producir descuento/costo erróneo sin validación de unidad en FEFO/costo.
