-- =============================================================================
-- 20260822000007_crear_pedido_qr.sql
--
-- HALLAZGO F-007 (HIGH, causa raíz RC-5) — auditoría forense 2026-08-22.
--
-- createPedidoFromQR insertaba el pedido y sus ítems con dos llamadas separadas
-- del cliente service_role, sin `area_produccion`. Consecuencias:
--   · los ítems quedaban con área NULL, así que no aparecían en ninguna cola KDS
--     (findActiveByArea filtra por area_produccion) y fn_transicionar_item los
--     rechaza. Un pedido QR de zona snack o buffet no podía llegar nunca a
--     'despachado' y por tanto tampoco a 'entregado': solo se podía cancelar;
--   · si fallaba el segundo INSERT quedaba un pedido huérfano sin ítems, que es
--     exactamente el defecto que fn_crear_pedido se creó para evitar
--     (20260530000004).
--
-- El camino QR no puede reutilizar fn_crear_pedido porque esa función deriva la
-- autorización de auth.jwt() y el pasajero es anónimo: su credencial es el token
-- de mesa, que la Server Action ya verificó. Esta RPC es su equivalente para
-- service_role, con la misma atomicidad.
--
-- El ruteo por área se calcula en la capa de aplicación (rutearPedido, dominio
-- de TypeScript) y llega ya resuelto en p_items, para no crear una segunda
-- definición de ZONA_AREAS_PERMITIDAS dentro de SQL.
--
-- Idempotente: CREATE OR REPLACE / REVOKE / GRANT.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_crear_pedido_qr(
  p_tenant_id       uuid,
  p_zona            public.zona_servicio,
  p_numero_mesa     text,
  p_notas           text,
  p_idempotency_key text,
  p_items           jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido_id uuid;
  v_item      jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Un pedido debe tener al menos un ítem' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND activo = true AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant inexistente o inactivo' USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.pedidos
    (tenant_id, zona, numero_mesa, notas, estado, origen, idempotency_key)
  VALUES
    (p_tenant_id, p_zona, p_numero_mesa, p_notas, 'creado', 'qr_pasajero', p_idempotency_key)
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- area_produccion es obligatoria: un ítem sin área es invisible para los
    -- cuatro KDS y bloquea el pedido para siempre (F-007).
    IF NULLIF(v_item->>'area_produccion', '') IS NULL THEN
      RAISE EXCEPTION 'Ítem sin área de producción asignada: receta %',
        v_item->>'receta_id' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.pedido_items
      (tenant_id, pedido_id, receta_id, cantidad, notas, area_produccion)
    VALUES (
      p_tenant_id,
      v_pedido_id,
      (v_item->>'receta_id')::uuid,
      (v_item->>'cantidad')::int,
      v_item->>'notas',
      (v_item->>'area_produccion')::public.area_produccion
    );
  END LOOP;

  RETURN v_pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_crear_pedido_qr(
  uuid, public.zona_servicio, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_crear_pedido_qr(
  uuid, public.zona_servicio, text, text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crear_pedido_qr(
  uuid, public.zona_servicio, text, text, text, jsonb) TO service_role;

-- =============================================================================
-- ROLLBACK (manual):
--   DROP FUNCTION IF EXISTS public.fn_crear_pedido_qr(
--     uuid, public.zona_servicio, text, text, text, jsonb);
--   Volvería a dejar el alta QR sin atomicidad y sin ruteo por área.
-- =============================================================================
