-- =============================================================================
-- pedidos_origen.sql
-- Agrega campo `origen` a pedidos para distinguir pedidos del mesero vs QR pasajero.
-- Agrega `idempotency_key` a nivel de pedido (de-dupe en QR offline).
-- Idempotente.
-- =============================================================================

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS origen text
    NOT NULL DEFAULT 'mesero'
    CHECK (origen IN ('mesero', 'qr_pasajero'));

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_idempotency_key_tenant_idx
  ON public.pedidos (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =============================================================================
-- ROLLBACK:
-- ALTER TABLE public.pedidos DROP COLUMN IF EXISTS idempotency_key;
-- ALTER TABLE public.pedidos DROP COLUMN IF EXISTS origen;
-- =============================================================================
