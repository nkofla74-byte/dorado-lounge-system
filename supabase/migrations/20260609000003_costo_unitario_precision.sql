-- =============================================================================
-- 20260609000003_costo_unitario_precision.sql
-- A3 (auditoría Cerberus): con unidades base en g/ml el costo unitario por
-- gramo es sub-céntimo; numeric(14,2) truncaba lo que el dominio calcula a 4
-- decimales (costoUnitarioNeto). El total monetario sigue en numeric(14,2).
-- Orden seguro: mv_cogs_per_passenger (única vista dependiente de esta columna)
-- se elimina antes, en 20260528000000. El ALTER reescribe la tabla (lock breve;
-- lotes es de bajo volumen). Re-ejecutable: al mismo tipo es un no-op funcional.
-- =============================================================================

ALTER TABLE public.lotes
  ALTER COLUMN costo_unitario TYPE numeric(14,4);
