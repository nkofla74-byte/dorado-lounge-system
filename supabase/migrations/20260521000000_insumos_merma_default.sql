-- ──────────────────────────────────────────────────────────────────────────────
-- 20260521000000_insumos_merma_default
-- Insumos — coeficiente de merma por defecto al registrar el producto.
--
-- Permite que al crear una receta y elegir un insumo, el formulario
-- autocomplete merma_coeficiente con este valor (editable como override).
-- No reemplaza receta_ingredientes.merma_coeficiente: este sigue siendo
-- la fuente autoritativa para el descuento FEFO.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS merma_default numeric(5,4) NOT NULL DEFAULT 0
    CHECK (merma_default >= 0 AND merma_default < 1);

COMMENT ON COLUMN public.insumos.merma_default IS
  'Coeficiente de merma aproximado del insumo [0, 1). Default sugerido al agregarlo a una receta. La merma efectiva del descuento vive en receta_ingredientes.merma_coeficiente.';
