-- =============================================================================
-- 20260824000002_recetas_rendimiento.sql
--
-- HALLAZGO F-037 — parte 2 de 3. CAUSA RAÍZ.
--
-- CLAUDE.md documenta la transformación «capa_1 → capa_2» y `recetas` ya tenía
-- `insumo_destino_id`, obligatorio para las recetas de producción y validado por
-- trigger contra un insumo de capa 2.
--
-- Pero faltaba la otra mitad del contrato: **cuánto** produce una tanda. Sin esa
-- cantidad, `fn_completar_tanda` no podía crear el lote de salida aunque
-- quisiera — no hay lote sin cantidad. Por eso el arreglo no es tocar la
-- función: es que el modelo no sabía expresar el rendimiento.
--
-- `porciones` no servía: en una receta de servicio significa raciones por plato,
-- y usarla para dos cosas distintas habría dejado el mismo campo con dos
-- significados según el tipo de receta.
--
-- La unidad NO se declara aquí a propósito: es la del insumo destino
-- (`insumos.unidad_medida`). Un segundo campo de unidad sería una segunda fuente
-- de verdad y acabaría contradiciendo a la primera.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.
-- =============================================================================

ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS rendimiento_cantidad numeric(12,4);

COMMENT ON COLUMN public.recetas.rendimiento_cantidad IS
  'Cantidad de insumo_destino_id que produce UNA tanda, en la unidad de ese '
  'insumo. Es rendimiento NETO: la merma de elaboración ya va descontada por '
  'quien define la receta. insumos.merma_default NO se aplica sobre esta salida '
  '— esa merma es la de recepción de compra (Principio Rector) y aplicarla aquí '
  'la contaría dos veces.';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- `porciones` es el ÚNICO dato existente que se aproxima al rendimiento, y en
-- las recetas de producción venía usándose de facto como «cuántas unidades
-- salen». Se copia como punto de partida.
--
-- ATENCIÓN: es una suposición, no un dato. Toda receta de producción anterior a
-- esta migración debe revisarse con el chef. Las que quedaron en el valor por
-- defecto (`porciones = 1`) darán un rendimiento de 1 unidad por tanda y un
-- costo unitario desorbitado, que es justo la señal de que hay que corregirlas:
--
--   SELECT id, nombre, porciones, rendimiento_cantidad
--   FROM public.recetas
--   WHERE tipo_receta = 'produccion' AND deleted_at IS NULL
--   ORDER BY rendimiento_cantidad;
UPDATE public.recetas
SET rendimiento_cantidad = porciones
WHERE tipo_receta = 'produccion'
  AND rendimiento_cantidad IS NULL;

-- ── Contrato ────────────────────────────────────────────────────────────────
-- A partir de aquí una receta de producción sin rendimiento no puede existir.
-- Si el backfill dejara alguna fuera, esta migración falla en voz alta en lugar
-- de dejar el sistema en el estado de F-037.
ALTER TABLE public.recetas
  DROP CONSTRAINT IF EXISTS recetas_produccion_tiene_rendimiento;
ALTER TABLE public.recetas
  ADD CONSTRAINT recetas_produccion_tiene_rendimiento CHECK (
    tipo_receta <> 'produccion'
    OR (rendimiento_cantidad IS NOT NULL AND rendimiento_cantidad > 0)
  );

-- =============================================================================
-- ROLLBACK (manual):
--   ALTER TABLE public.recetas DROP CONSTRAINT IF EXISTS recetas_produccion_tiene_rendimiento;
--   ALTER TABLE public.recetas DROP COLUMN IF EXISTS rendimiento_cantidad;
--   Requiere revertir antes 20260824000003, que depende de la columna.
-- =============================================================================
