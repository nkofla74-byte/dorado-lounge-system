-- 20260611100000_snack_buffet_rls_tanda_link
-- Frente 1 (Snack & Buffet) — spec docs/superpowers/specs/2026-06-11-cierre-operacional-design.md
--
-- 1. Extiende las políticas de modificación de pedidos/pedido_items a los roles
--    de zona (personal_snack, personal_buffet) y corrige el hueco latente de los
--    roles de área (chef_cocina_fria, chef_cocina_caliente, personal_pasteleria)
--    que operan ítems vía cliente de usuario (fn_crear_pedido es SECURITY INVOKER).
-- 2. tandas_produccion.pedido_item_id: trazabilidad de la tanda producida para
--    un ítem de pedido de elaboración (snack/buffet). Nullable: las tandas de
--    producción interna no nacen de un pedido.
--
-- Idempotente. Sin DROP de columnas ni tablas.

DROP POLICY IF EXISTS "pedidos_modify_mesero" ON public.pedidos;
CREATE POLICY "pedidos_modify_mesero" ON public.pedidos
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente',
      'sous_chef', 'mesero_amex', 'personal_pasteleria',
      'personal_snack', 'personal_buffet'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "pedido_items_modify_mesero" ON public.pedido_items;
CREATE POLICY "pedido_items_modify_mesero" ON public.pedido_items
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente',
      'sous_chef', 'mesero_amex', 'personal_pasteleria',
      'personal_snack', 'personal_buffet'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- ON DELETE SET NULL explícito: si un futuro purge físico (GDPR A-27) borra el
-- pedido y cascadea a sus items, la tanda sobrevive (el inventario ya se consumió)
-- y solo pierde el vínculo. Sin esto, el default NO ACTION bloquearía el purge.
ALTER TABLE public.tandas_produccion
  ADD COLUMN IF NOT EXISTS pedido_item_id uuid REFERENCES public.pedido_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tandas_produccion.pedido_item_id IS
  'Ítem de pedido (elaboración snack/buffet) que originó esta tanda. NULL para producción interna sin pedido.';

CREATE INDEX IF NOT EXISTS idx_tandas_pedido_item
  ON public.tandas_produccion(tenant_id, pedido_item_id)
  WHERE pedido_item_id IS NOT NULL;
