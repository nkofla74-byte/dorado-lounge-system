-- =============================================================================
-- 20260530000001_merma_recepcion.sql
-- Refoco operacional (F3) — la merma se aplica UNA VEZ en la recepción.
--
-- Decisión del dueño (2026-05-30): el inventario almacena el peso NETO usable;
-- el consumo de recetas descuenta neto directo. La merma sube a ser propiedad
-- del insumo (`insumos.merma_default`) y `receta_ingredientes.merma_coeficiente`
-- queda como histórico (ya no se usa en descuento ni costo).
--
-- Esta migración:
--   1. Convierte el stock EXISTENTE de bruto a neto (cantidad y costo unitario,
--      preservando el valor total del lote) usando el coeficiente de la receta.
--   2. Puebla `insumos.merma_default` con ese coeficiente.
--
-- Los datos cooperan: cada insumo tiene un único coeficiente en sus recetas, así
-- que MAX(merma_coeficiente) es unívoco. Insumos sin merma quedan en 0.
--
-- Idempotente: las conversiones (paso 1) están guardadas por `merma_default = 0`
-- (insumo aún no procesado) y corren ANTES de poblar `merma_default` (paso 2).
-- Tras una corrida exitosa, merma_default > 0 ⇒ una re-ejecución no reescala.
-- =============================================================================

BEGIN;

-- 1) Netear lotes existentes (cantidad + costo) por el coeficiente de la receta.
--    Solo insumos no procesados aún (merma_default = 0). ANTES del paso 2.
WITH coefs AS (
  SELECT insumo_id, MAX(merma_coeficiente) AS coef
  FROM   public.receta_ingredientes
  WHERE  merma_coeficiente > 0
  GROUP  BY insumo_id
)
UPDATE public.lotes l
SET cantidad_inicial = round(l.cantidad_inicial * (1 - c.coef), 4),
    cantidad_actual  = round(l.cantidad_actual  * (1 - c.coef), 4),
    costo_unitario   = CASE
                         WHEN l.costo_unitario IS NOT NULL
                         THEN round(l.costo_unitario / (1 - c.coef), 4)
                         ELSE NULL
                       END
FROM   coefs c
JOIN   public.insumos i ON i.id = c.insumo_id
WHERE  l.insumo_id = c.insumo_id
  AND  i.merma_default = 0;

-- 2) Poblar insumos.merma_default desde el coeficiente único de sus recetas.
--    Al quedar > 0, el guard del paso 1 evita reescalar en re-ejecuciones.
UPDATE public.insumos i
SET merma_default = c.coef
FROM (
  SELECT insumo_id, MAX(merma_coeficiente) AS coef
  FROM   public.receta_ingredientes
  WHERE  merma_coeficiente > 0
  GROUP  BY insumo_id
) c
WHERE i.id = c.insumo_id
  AND i.merma_default = 0;

COMMIT;
