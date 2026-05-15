-- =============================================================================
-- 20260514000001_turnos_teamlider.sql
-- Agrega campo teamlider obligatorio a la tabla turnos.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS teamlider text NOT NULL DEFAULT '';

-- Eliminar el DEFAULT luego de agregar la columna para que futuras filas
-- lo requieran explícitamente. Las filas existentes quedan con ''.
ALTER TABLE public.turnos
  ALTER COLUMN teamlider DROP DEFAULT;
