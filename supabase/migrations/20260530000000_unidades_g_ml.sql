-- =============================================================================
-- 20260530000000_unidades_g_ml.sql
-- Refoco operacional (F2) — estandariza las unidades de medida a {g, ml, unidad}.
--
-- Decisión del dueño (2026-05-30): se MANTIENE `unidad` para insumos contables
-- (p.ej. aguacate); se convierten peso/volumen a la unidad canónica:
--   kg → g (×1000) · lb → g (×453.59237) · l → ml (×1000).
-- `porcion` se descarta (no hay datos). Los valores kg/lb/l/porcion quedan
-- INERTES en el tipo enum `unidad_medida` (Postgres no permite DROP VALUE sin
-- recrear el tipo). El enum TS/Zod es la barrera para nuevas capturas.
--
-- Cantidades almacenadas (lotes, receta_ingredientes) están expresadas en la
-- unidad base del insumo, por lo que también se reescalan. El `peso_unitario`
-- de empaque depende de `unidad_peso` y se reescala por separado.
--
-- Idempotente: los UPDATE filtran por las unidades de origen; tras una corrida
-- exitosa no quedan filas en kg/lb/l, por lo que una re-ejecución no reescala.
-- Orden obligatorio: reescalar dependientes (filtrados por la unidad del padre)
-- ANTES de voltear la unidad del insumo.
-- =============================================================================

BEGIN;

-- 1) receta_ingredientes con unidad_display EXPLÍCITA en peso/volumen.
--    (Hoy no hay ninguna; se incluye por corrección general.)
UPDATE receta_ingredientes
SET cantidad = cantidad * 1000, unidad_display = 'g'
WHERE unidad_display = 'kg';
UPDATE receta_ingredientes
SET cantidad = cantidad * 453.59237, unidad_display = 'g'
WHERE unidad_display = 'lb';
UPDATE receta_ingredientes
SET cantidad = cantidad * 1000, unidad_display = 'ml'
WHERE unidad_display = 'l';

-- 2) receta_ingredientes que HEREDAN la unidad base del insumo (unidad_display NULL).
--    Debe correr ANTES de voltear insumos (paso 5).
UPDATE receta_ingredientes ri
SET cantidad = ri.cantidad * 1000
FROM insumos i
WHERE i.id = ri.insumo_id AND ri.unidad_display IS NULL AND i.unidad_medida = 'kg';
UPDATE receta_ingredientes ri
SET cantidad = ri.cantidad * 453.59237
FROM insumos i
WHERE i.id = ri.insumo_id AND ri.unidad_display IS NULL AND i.unidad_medida = 'lb';
UPDATE receta_ingredientes ri
SET cantidad = ri.cantidad * 1000
FROM insumos i
WHERE i.id = ri.insumo_id AND ri.unidad_display IS NULL AND i.unidad_medida = 'l';

-- 3) Cantidades de lote (expresadas en la unidad base del insumo) Y su costo
--    unitario. La cantidad se multiplica por el factor (kg→g ×1000); el
--    costo_unitario es COP por unidad base, por lo que se DIVIDE por el mismo
--    factor (COP/kg → COP/g). Así `fn_costo_receta` (cantidad × costo_unitario)
--    queda invariante al cambio de unidad. Debe correr ANTES de voltear insumos.
UPDATE lotes l
SET cantidad_inicial = l.cantidad_inicial * 1000,
    cantidad_actual  = l.cantidad_actual * 1000,
    costo_unitario   = CASE WHEN l.costo_unitario IS NOT NULL
                            THEN round(l.costo_unitario / 1000, 4)
                            ELSE NULL END
FROM insumos i
WHERE i.id = l.insumo_id AND i.unidad_medida IN ('kg', 'l');
UPDATE lotes l
SET cantidad_inicial = l.cantidad_inicial * 453.59237,
    cantidad_actual  = l.cantidad_actual * 453.59237,
    costo_unitario   = CASE WHEN l.costo_unitario IS NOT NULL
                            THEN round(l.costo_unitario / 453.59237, 4)
                            ELSE NULL END
FROM insumos i
WHERE i.id = l.insumo_id AND i.unidad_medida = 'lb';

-- 4) Peso unitario de empaque (independiente; depende de unidad_peso).
UPDATE lotes
SET peso_unitario = peso_unitario * 1000, unidad_peso = 'g'
WHERE unidad_peso = 'kg';
UPDATE lotes
SET peso_unitario = peso_unitario * 453.59237, unidad_peso = 'g'
WHERE unidad_peso = 'lb';
UPDATE lotes
SET peso_unitario = peso_unitario * 1000, unidad_peso = 'ml'
WHERE unidad_peso = 'l';

-- 5) Voltear la unidad del insumo + reescalar stock_minimo.
UPDATE insumos
SET stock_minimo = stock_minimo * 1000, unidad_medida = 'g'
WHERE unidad_medida = 'kg';
UPDATE insumos
SET stock_minimo = stock_minimo * 453.59237, unidad_medida = 'g'
WHERE unidad_medida = 'lb';
UPDATE insumos
SET stock_minimo = stock_minimo * 1000, unidad_medida = 'ml'
WHERE unidad_medida = 'l';

-- `porcion` no tiene equivalencia g/ml; al no existir datos no se convierte.
-- Si en el futuro apareciera, fallar ruidosamente en captura vía enum TS/Zod.

COMMIT;
