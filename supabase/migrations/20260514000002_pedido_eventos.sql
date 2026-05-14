-- =============================================================================
-- 20260514000002_pedido_eventos.sql
-- Tabla de trazabilidad de pedidos AMEX: un registro por cada cambio de estado.
-- Agrega también el estado recibido_cocina al enum de EstadoPedido.
-- Idempotente.
-- =============================================================================

-- ── Ampliar enum EstadoPedido ─────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE public.estado_pedido ADD VALUE IF NOT EXISTS 'recibido_cocina' AFTER 'creado';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabla: pedido_eventos ─────────────────────────────────────────────────────
-- Registra cada transición de estado de un pedido con timestamp y actor.
CREATE TABLE IF NOT EXISTS public.pedido_eventos (
  id           uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid              NOT NULL REFERENCES public.tenants(id),
  pedido_id    uuid              NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  estado       public.estado_pedido NOT NULL,
  actor_id     uuid              REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido_id
  ON public.pedido_eventos(pedido_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pedido_eventos_tenant_id
  ON public.pedido_eventos(tenant_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.pedido_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_eventos_tenant_select" ON public.pedido_eventos;
CREATE POLICY "pedido_eventos_tenant_select" ON public.pedido_eventos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "pedido_eventos_tenant_insert" ON public.pedido_eventos;
CREATE POLICY "pedido_eventos_tenant_insert" ON public.pedido_eventos
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
