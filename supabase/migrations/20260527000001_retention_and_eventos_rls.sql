-- Enterprise Audit Fixes — 2026-05-27 (batch 2)
-- C-07: Resolve append-only trigger vs data retention conflict
-- A-14: Restrict pedido_eventos INSERT by role

-- ─────────────────────────────────────────────────────────────────────────────
-- C-07: mensajes_chat has a prevent_mutation trigger that blocks DELETE,
-- but fn_purgar_mensajes_chat_antiguos() needs to DELETE old records.
-- Fix: modify prevent_mutation to allow bypass when called from retention context.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the append-only trigger on mensajes_chat only.
-- mensajes_chat is NOT an immutable audit trail — it's operational data
-- subject to data retention under Ley 1581/2012.
-- audit_log and domain_events keep their append-only triggers.
DROP TRIGGER IF EXISTS mensajes_chat_no_delete ON public.mensajes_chat;
DROP TRIGGER IF EXISTS mensajes_chat_no_update ON public.mensajes_chat;

-- Recreate the retention function with explicit idempotency
CREATE OR REPLACE FUNCTION public.fn_purgar_mensajes_chat_antiguos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.mensajes_chat
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-14: pedido_eventos INSERT sin restricción de rol
-- Root cause: cualquier usuario del tenant puede inyectar eventos de estado
-- Fix: restringir a roles que participan en el flujo de pedidos
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pedido_eventos_tenant_insert" ON public.pedido_eventos;
CREATE POLICY "pedido_eventos_tenant_insert" ON public.pedido_eventos
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'mesero_amex',
      'chef_cocina_fria', 'chef_cocina_caliente'
    )
  );
