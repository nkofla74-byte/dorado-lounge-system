-- Agrega política INSERT para mensajes_chat.
-- Faltaba desde la migración 0007 — solo existía SELECT.
-- Permite a cualquier usuario autenticado insertar mensajes en su propio tenant.
-- Idempotente.

DROP POLICY IF EXISTS "chat_insert_same_tenant" ON public.mensajes_chat;
CREATE POLICY "chat_insert_same_tenant" ON public.mensajes_chat
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND remitente_id = auth.uid()
  );
