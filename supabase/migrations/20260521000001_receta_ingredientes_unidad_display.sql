-- ──────────────────────────────────────────────────────────────────────────────
-- 20260521000001_receta_ingredientes_unidad_display
-- Recetas — unidad de display por línea de ingrediente.
--
-- Permite que un ingrediente se ingrese y se muestre en una unidad distinta
-- a la unidad base del insumo (ej: insumo en kg, ingrediente en g). La columna
-- `cantidad` sigue almacenándose en la unidad base del insumo, así que el
-- contrato de fn_descontar_insumo_fefo no cambia.
--
-- NULL = mostrar en la unidad base del insumo.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.receta_ingredientes
  ADD COLUMN IF NOT EXISTS unidad_display public.unidad_medida;

COMMENT ON COLUMN public.receta_ingredientes.unidad_display IS
  'Unidad en la que el usuario ingresó/visualiza la cantidad. La columna cantidad sigue almacenada en la unidad base del insumo. NULL = misma unidad que el insumo.';
