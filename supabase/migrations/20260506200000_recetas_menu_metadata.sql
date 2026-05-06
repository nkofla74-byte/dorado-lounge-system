-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: metadata de menú para recetas de tipo servicio
-- Agrega categoria_menu (entradas/plato_fuerte/acompanante) y descripcion
-- Idempotente
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.categoria_menu AS ENUM ('entrada', 'plato_fuerte', 'acompanante');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS categoria_menu public.categoria_menu;

ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS descripcion text;

CREATE INDEX IF NOT EXISTS idx_recetas_categoria_menu
  ON public.recetas(tenant_id, categoria_menu)
  WHERE categoria_menu IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.recetas.categoria_menu IS
  'Sección del menú público: entrada, plato_fuerte o acompanante. Nullable = no aparece en menú QR.';
COMMENT ON COLUMN public.recetas.descripcion IS
  'Descripción corta del plato visible al pasajero en el menú QR.';
