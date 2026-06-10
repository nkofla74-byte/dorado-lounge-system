-- =============================================================================
-- 20260530000004_fn_crear_pedido.sql
-- Atomicidad en la creación de pedidos (corrige hallazgo de auditoría C4).
--
-- Antes: order-repository.create() hacía dos INSERT independientes (pedido y
-- luego pedido_items). Si fallaba el segundo, quedaba un pedido HUÉRFANO sin
-- ítems en las colas KDS y sin ingredientes que descontar al entregar.
--
-- Esta RPC inserta el pedido y todos sus ítems en UNA sola transacción (toda
-- función plpgsql corre en su propia transacción: si cualquier INSERT falla,
-- se revierte el pedido completo). Devuelve el id del pedido creado.
--
-- SECURITY INVOKER (default): corre con el JWT del caller, así que la RLS
-- multi-tenant de pedidos/pedido_items se sigue aplicando. La violación de
-- idempotency_key (unique) propaga sqlstate 23505 para que la capa de app la
-- mapee a DUPLICATE_PEDIDO. Idempotente (CREATE OR REPLACE).
--
-- Requiere pedido_items.area_produccion (20260528000002), por lo que esta
-- migración corre después.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_crear_pedido(
  p_tenant_id        uuid,
  p_responsable_id   uuid,
  p_zona             public.zona_servicio,
  p_numero_mesa      text,
  p_notas            text,
  p_idempotency_key  text,
  p_turno_id         uuid,
  p_items            jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pedido_id uuid;
  v_item      jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Un pedido debe tener al menos un ítem' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.pedidos
    (tenant_id, responsable_id, zona, numero_mesa, notas, idempotency_key, turno_id)
  VALUES
    (p_tenant_id, p_responsable_id, p_zona, p_numero_mesa, p_notas, p_idempotency_key, p_turno_id)
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.pedido_items
      (tenant_id, pedido_id, receta_id, cantidad, notas, area_produccion)
    VALUES (
      p_tenant_id,
      v_pedido_id,
      (v_item->>'receta_id')::uuid,
      (v_item->>'cantidad')::int,
      v_item->>'notas',
      NULLIF(v_item->>'area_produccion', '')::public.area_produccion
    );
  END LOOP;

  RETURN v_pedido_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_crear_pedido(
  uuid, uuid, public.zona_servicio, text, text, text, uuid, jsonb
) TO authenticated;
