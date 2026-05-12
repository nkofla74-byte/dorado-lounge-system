-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: agregar área de producción a recetas
-- Permite segmentar terminales de producción: cocina (chef), pasteleria, amex
-- Idempotente: usa IF NOT EXISTS y ADD COLUMN IF NOT EXISTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Enum área de producción (terminales operativas)
DO $$ BEGIN
  CREATE TYPE public.area_produccion AS ENUM ('cocina', 'pasteleria', 'amex');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Columna nullable: recetas existentes quedan sin área asignada
ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS area_produccion public.area_produccion;

CREATE INDEX IF NOT EXISTS idx_recetas_area_produccion
  ON public.recetas(tenant_id, area_produccion)
  WHERE area_produccion IS NOT NULL;

COMMENT ON COLUMN public.recetas.area_produccion IS
  'Terminal de producción operativa: cocina (chef), pasteleria, amex. Nullable para recetas sin asignar.';
