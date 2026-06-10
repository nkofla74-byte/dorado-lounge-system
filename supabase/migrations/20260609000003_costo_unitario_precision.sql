-- =============================================================================
-- 20260609000003_costo_unitario_precision.sql
-- A3 (auditoría Cerberus): con unidades base en g/ml el costo unitario por
-- gramo es sub-céntimo; numeric(14,2) truncaba lo que el dominio calcula a 4
-- decimales (costoUnitarioNeto). El total monetario sigue en numeric(14,2).
-- Re-ejecutable (ALTER TYPE al mismo tipo es un no-op funcional).
-- =============================================================================

ALTER TABLE public.lotes
  ALTER COLUMN costo_unitario TYPE numeric(14,4);
