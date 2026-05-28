-- =============================================================================
-- 20260528000002_pedido_trazabilidad.sql
-- Refoco operacional — campos de trazabilidad y ruteo en el pedido.
--
--   • pedidos.prioridad        — prioridad operativa del pedido (alta/normal/baja).
--   • pedidos.cocinero_id      — cocinero asignado a la preparación.
--   • pedido_items.area_produccion — área destino (KDS) a la que se rutea el ítem,
--                                    calculada al crear el pedido (ver routing.ts).
--
-- Aditiva e idempotente. La columna usa el enum prioridad_pedido (creado aquí en
-- la misma transacción — permitido para CREATE TYPE, a diferencia de ADD VALUE).
-- =============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.prioridad_pedido AS ENUM ('alta', 'normal', 'baja');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS prioridad public.prioridad_pedido NOT NULL DEFAULT 'normal';

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cocinero_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS area_produccion public.area_produccion;

-- Índice parcial para colas de KDS por área (pedidos activos ruteados a un área).
CREATE INDEX IF NOT EXISTS idx_pedido_items_area
  ON public.pedido_items(tenant_id, area_produccion)
  WHERE area_produccion IS NOT NULL;

COMMENT ON COLUMN public.pedidos.prioridad IS
  'Prioridad operativa del pedido. Default normal.';
COMMENT ON COLUMN public.pedidos.cocinero_id IS
  'Cocinero asignado a la preparación (trazabilidad de responsable).';
COMMENT ON COLUMN public.pedido_items.area_produccion IS
  'Área productiva (KDS) destino del ítem, ruteada al crear el pedido según la receta.';

COMMIT;
