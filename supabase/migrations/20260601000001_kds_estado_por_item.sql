-- =============================================================================
-- 20260601000001_kds_estado_por_item.sql
-- KDS: estado por ítem, tiempos/actores y log append-only de trazabilidad por producto.
-- Idempotente. RLS habilitada. pedido_item_eventos es append-only (sin UPDATE/DELETE en app).
-- =============================================================================

-- 1) Estado y tiempos en pedido_items
ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_preparacion', 'listo')),
  ADD COLUMN IF NOT EXISTS en_preparacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS listo_at timestamptz,
  ADD COLUMN IF NOT EXISTS iniciado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS listo_por uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 2) Log append-only por ítem
CREATE TABLE IF NOT EXISTS public.pedido_item_eventos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),
  pedido_id   uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES public.pedido_items(id) ON DELETE CASCADE,
  estado      text NOT NULL CHECK (estado IN ('pendiente', 'en_preparacion', 'listo')),
  actor_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_item_eventos_tenant_pedido
  ON public.pedido_item_eventos (tenant_id, pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_item_eventos_item_created
  ON public.pedido_item_eventos (item_id, created_at);

ALTER TABLE public.pedido_item_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_item_eventos_tenant_select" ON public.pedido_item_eventos;
CREATE POLICY "pedido_item_eventos_tenant_select" ON public.pedido_item_eventos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "pedido_item_eventos_tenant_insert" ON public.pedido_item_eventos;
CREATE POLICY "pedido_item_eventos_tenant_insert" ON public.pedido_item_eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'mesero_amex',
      'chef_cocina_fria', 'chef_cocina_caliente'
    )
  );

-- 3) Backfill del estado de ítems según el estado del pedido
UPDATE public.pedido_items it
SET estado = 'listo', listo_at = p.updated_at
FROM public.pedidos p
WHERE it.pedido_id = p.id AND p.estado IN ('despachado', 'entregado');

UPDATE public.pedido_items it
SET estado = 'en_preparacion', en_preparacion_at = p.updated_at
FROM public.pedidos p
WHERE it.pedido_id = p.id AND p.estado = 'en_preparacion';

COMMENT ON COLUMN public.pedido_items.estado IS 'KDS: pendiente|en_preparacion|listo. Despacho por área.';
COMMENT ON TABLE public.pedido_item_eventos IS 'Append-only: traza por ítem (quién/cuándo). Recalls = nueva fila.';
