-- =============================================================================
-- 20260822000004_pedidos_rpc.sql
--
-- HALLAZGOS F-002 (HIGH), F-008 (HIGH) y F-009 (HIGH) — auditoría 2026-08-22.
-- Causas raíz RC-1 (invariantes solo en la capa de aplicación) y RC-3 (escritura
-- multipaso sin frontera transaccional).
--
-- F-002 — "Nada sale de cocina sin receta" se aplicaba únicamente en
--   orders/actions.ts. La política `pedidos_modify_mesero` era FOR ALL y no se
--   revocó nunca el privilegio de tabla, así que un mesero_amex con su propia
--   sesión podía hacer, desde la consola del navegador:
--       PATCH /rest/v1/pedidos?id=eq.X  {"estado":"entregado"}
--   El trigger validate_pedido_estado acepta despachado->entregado, el FEFO
--   nunca se ejecutaba y el pedido quedaba entregado con el stock intacto.
--   Verificado en base real: 1 fila afectada, 0 movimientos de inventario.
--
-- F-008 — entregarPedido aplicaba los descuentos FEFO en un bucle de llamadas
--   independientes y solo después intentaba el cambio de estado con locking
--   optimista. Un fallo intermedio (stock insuficiente en el insumo N, conflicto
--   de versión) dejaba stock descontado sin pedido entregado, sin compensación.
--
-- F-009 — transitionItem confirmaba el UPDATE del ítem y el INSERT del evento
--   antes de comprobar la versión del pedido. Un 409 devolvía "recarga e intenta
--   de nuevo" con el ítem ya modificado en base.
--
-- ESTE FIX mueve TODA la escritura de pedidos a RPCs SECURITY DEFINER que:
--   · derivan tenant, rol y usuario de auth.jwt() — nunca de parámetros, que fue
--     el defecto del overload huérfano de FEFO corregido en 20260615000000;
--   · autorizan contra la matriz rbac_permisos (fn_puede);
--   · aplican la guarda de zona de los roles atados (snack/buffet);
--   · hacen todo el trabajo dentro de UNA transacción de plpgsql.
-- Y a continuación revoca INSERT/UPDATE de tabla sobre pedidos y sus hijos, de
-- modo que la RPC es el único camino posible.
--
-- Idempotente: CREATE OR REPLACE / DROP POLICY IF EXISTS / REVOKE / GRANT.
-- =============================================================================

-- ── Guarda de zona ───────────────────────────────────────────────────────────
-- Espejo de zonaPermitidaParaRol(): los roles de zona solo operan la suya.
CREATE OR REPLACE FUNCTION public.fn_zona_permitida_para_rol(p_zona public.zona_servicio)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT CASE public.fn_jwt_role()
    WHEN 'personal_snack'  THEN p_zona = 'snack'
    WHEN 'personal_buffet' THEN p_zona = 'buffet'
    ELSE true
  END
$$;
GRANT EXECUTE ON FUNCTION public.fn_zona_permitida_para_rol(public.zona_servicio)
  TO authenticated, service_role;


-- ── Permiso requerido por estado destino ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_permiso_transicion_pedido(p_estado public.estado_pedido)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_estado
    WHEN 'recibido_cocina' THEN 'orders:receive'
    WHEN 'en_preparacion'  THEN 'orders:dispatch'
    WHEN 'despachado'      THEN 'orders:dispatch'
    WHEN 'cancelado'       THEN 'orders:cancel'
    ELSE NULL  -- 'entregado' exige fn_entregar_pedido; 'creado' no es destino
  END
$$;


-- ── fn_pedido_transicion ─────────────────────────────────────────────────────
-- Transiciones que NO mueven inventario. La entrega tiene su propia RPC porque
-- debe descontar stock en la misma transacción.
CREATE OR REPLACE FUNCTION public.fn_pedido_transicion(
  p_pedido_id uuid,
  p_estado    public.estado_pedido,
  p_version   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := public.fn_jwt_tenant();
  v_permiso text := public.fn_permiso_transicion_pedido(p_estado);
  v_pedido  record;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sesión sin tenant' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_permiso IS NULL THEN
    RAISE EXCEPTION 'La transición a "%" no se hace por esta vía', p_estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_puede(v_permiso) THEN
    RAISE EXCEPTION 'El rol "%" no tiene el permiso %', public.fn_jwt_role(), v_permiso
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- FOR UPDATE: serializa contra otras transiciones del mismo pedido.
  SELECT id, estado, zona, version INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id AND tenant_id = v_tenant AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_zona_permitida_para_rol(v_pedido.zona) THEN
    RAISE EXCEPTION 'El rol "%" no puede operar la zona "%"',
      public.fn_jwt_role(), v_pedido.zona USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_pedido.version <> p_version THEN
    RAISE EXCEPTION 'Conflicto de versión' USING ERRCODE = 'serialization_failure';
  END IF;

  -- El trigger validate_pedido_estado valida la máquina de estados y aborta la
  -- transacción completa si la transición es inválida.
  UPDATE public.pedidos
  SET estado = p_estado, version = version + 1, updated_at = now()
  WHERE id = p_pedido_id;

  INSERT INTO public.pedido_eventos (tenant_id, pedido_id, estado, actor_id)
  VALUES (v_tenant, p_pedido_id, p_estado, public.fn_jwt_user());

  RETURN jsonb_build_object(
    'ok', true, 'pedido_id', p_pedido_id,
    'estado_anterior', v_pedido.estado, 'estado', p_estado,
    'version', p_version + 1, 'zona', v_pedido.zona);
END;
$$;


-- ── fn_pedido_asignar_cocinero ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pedido_asignar_cocinero(
  p_pedido_id   uuid,
  p_cocinero_id uuid,
  p_version     integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.fn_jwt_tenant();
  v_pedido record;
BEGIN
  IF v_tenant IS NULL OR NOT public.fn_puede('orders:dispatch') THEN
    RAISE EXCEPTION 'Sin permiso orders:dispatch' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El id del cocinero llega del cliente: debe pertenecer a esta sala.
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_cocinero_id AND tenant_id = v_tenant AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'El cocinero no pertenece a este establecimiento'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT id, zona, version INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id AND tenant_id = v_tenant AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_pedido.version <> p_version THEN
    RAISE EXCEPTION 'Conflicto de versión' USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE public.pedidos
  SET cocinero_id = p_cocinero_id, version = version + 1, updated_at = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'ok', true, 'pedido_id', p_pedido_id,
    'cocinero_id', p_cocinero_id, 'version', p_version + 1, 'zona', v_pedido.zona);
END;
$$;


-- ── fn_entregar_pedido ───────────────────────────────────────────────────────
-- El Principio Rector, aplicado por la base: descuento FEFO de todos los
-- ingredientes y cambio de estado en UNA sola transacción. Si falta stock para
-- cualquier insumo, no se descuenta nada y el pedido no se entrega.
--
-- Las recetas de tipo 'produccion' se excluyen: su FEFO ya ocurrió al completar
-- la tanda (fn_completar_tanda). Descontar aquí sería doble descuento.
CREATE OR REPLACE FUNCTION public.fn_entregar_pedido(
  p_pedido_id uuid,
  p_version   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant    uuid := public.fn_jwt_tenant();
  v_usuario   uuid := public.fn_jwt_user();
  v_pedido    record;
  v_ing       record;
  v_descuentos integer := 0;
BEGIN
  IF v_tenant IS NULL OR NOT public.fn_puede('orders:deliver') THEN
    RAISE EXCEPTION 'Sin permiso orders:deliver' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, estado, zona, version, turno_id INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id AND tenant_id = v_tenant AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_zona_permitida_para_rol(v_pedido.zona) THEN
    RAISE EXCEPTION 'El rol "%" no puede operar la zona "%"',
      public.fn_jwt_role(), v_pedido.zona USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_pedido.version <> p_version THEN
    RAISE EXCEPTION 'Conflicto de versión' USING ERRCODE = 'serialization_failure';
  END IF;

  -- Descuento por ingrediente. La clave de idempotencia es estable por
  -- (pedido, ítem, insumo): un reintento no vuelve a descontar.
  FOR v_ing IN
    SELECT pi.id                              AS item_id,
           ri.insumo_id                       AS insumo_id,
           i.nombre                           AS insumo_nombre,
           (ri.cantidad / GREATEST(r.porciones, 1)) * pi.cantidad AS cantidad
    FROM public.pedido_items pi
    JOIN public.recetas r              ON r.id = pi.receta_id
    JOIN public.receta_ingredientes ri ON ri.receta_id = r.id
    JOIN public.insumos i              ON i.id = ri.insumo_id
    WHERE pi.pedido_id = p_pedido_id
      AND pi.tenant_id = v_tenant
      AND r.tipo_receta <> 'produccion'
  LOOP
    PERFORM public.fn_descontar_insumo_fefo(
      v_tenant,
      v_ing.insumo_id,
      v_ing.cantidad,
      format('pedido:%s:item:%s:ing:%s', p_pedido_id, v_ing.item_id, v_ing.insumo_id),
      'salida_receta'::public.tipo_movimiento,
      p_pedido_id,
      'pedido',
      v_usuario,
      v_pedido.turno_id
    );
    v_descuentos := v_descuentos + 1;
  END LOOP;

  UPDATE public.pedidos
  SET estado = 'entregado', version = version + 1, updated_at = now()
  WHERE id = p_pedido_id;

  INSERT INTO public.pedido_eventos (tenant_id, pedido_id, estado, actor_id)
  VALUES (v_tenant, p_pedido_id, 'entregado', v_usuario);

  RETURN jsonb_build_object(
    'ok', true, 'pedido_id', p_pedido_id,
    'estado_anterior', v_pedido.estado, 'estado', 'entregado',
    'version', p_version + 1, 'zona', v_pedido.zona,
    'descuentos', v_descuentos);
END;
$$;


-- ── fn_transicionar_item ─────────────────────────────────────────────────────
-- Ítem, evento y estado agregado del pedido en una sola transacción, con el
-- pedido bloqueado desde el principio. Un conflicto de versión aborta el
-- conjunto: el ítem NO queda modificado (F-009).
-- `pedido_items.estado` es text con CHECK (no un enum), así que la firma usa
-- text y la función valida el dominio explícitamente.
CREATE OR REPLACE FUNCTION public.fn_transicionar_item(
  p_item_id uuid,
  p_estado  text,
  p_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant        uuid := public.fn_jwt_tenant();
  v_usuario       uuid := public.fn_jwt_user();
  v_item          record;
  v_pedido        record;
  v_permiso       text;
  v_estado_nuevo  public.estado_pedido;
  v_todos_listos  boolean;
  v_alguno_en_prep boolean;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sesión sin tenant' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_estado NOT IN ('pendiente', 'en_preparacion', 'listo') THEN
    RAISE EXCEPTION 'Estado de ítem desconocido: %', p_estado USING ERRCODE = 'check_violation';
  END IF;

  SELECT pi.id, pi.pedido_id, pi.estado, pi.area_produccion
    INTO v_item
  FROM public.pedido_items pi
  WHERE pi.id = p_item_id AND pi.tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ítem no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.area_produccion IS NULL THEN
    RAISE EXCEPTION 'El ítem no tiene área productiva asignada'
      USING ERRCODE = 'check_violation';
  END IF;

  v_permiso := CASE v_item.area_produccion
    WHEN 'cocina_fria'     THEN 'cocina_fria:write'
    WHEN 'cocina_caliente' THEN 'cocina_caliente:write'
    WHEN 'amex'            THEN 'cocina_amex:write'
    WHEN 'pasteleria'      THEN 'pasteleria:write'
    ELSE NULL
  END;

  IF v_permiso IS NULL THEN
    RAISE EXCEPTION 'Área sin despacho KDS: %', v_item.area_produccion
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_puede(v_permiso) THEN
    RAISE EXCEPTION 'El rol "%" no puede despachar el área "%"',
      public.fn_jwt_role(), v_item.area_produccion USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Bloquear el pedido ANTES de tocar el ítem: es lo que hace atómico el conjunto.
  SELECT id, estado, zona, version INTO v_pedido
  FROM public.pedidos
  WHERE id = v_item.pedido_id AND tenant_id = v_tenant AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_pedido.version <> p_version THEN
    RAISE EXCEPTION 'Conflicto de versión' USING ERRCODE = 'serialization_failure';
  END IF;

  -- Máquina de estados del ítem: pendiente -> en_preparacion -> listo, con
  -- recall listo -> en_preparacion.
  IF NOT (
       (v_item.estado = 'pendiente'      AND p_estado = 'en_preparacion')
    OR (v_item.estado = 'en_preparacion' AND p_estado = 'listo')
    OR (v_item.estado = 'listo'          AND p_estado = 'en_preparacion')
  ) THEN
    RAISE EXCEPTION 'No se puede pasar el ítem de "%" a "%"', v_item.estado, p_estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- El recall no puede reabrir un pedido ya cerrado.
  IF v_item.estado = 'listo' AND p_estado = 'en_preparacion'
     AND v_pedido.estado IN ('despachado', 'entregado', 'cancelado') THEN
    RAISE EXCEPTION 'No se puede hacer recall de un pedido ya despachado o cerrado'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.pedido_items
  SET estado           = p_estado,
      en_preparacion_at = CASE WHEN p_estado = 'en_preparacion' THEN now() ELSE en_preparacion_at END,
      iniciado_por      = CASE WHEN p_estado = 'en_preparacion' THEN v_usuario ELSE iniciado_por END,
      listo_at          = CASE WHEN p_estado = 'listo' THEN now() ELSE listo_at END,
      listo_por         = CASE WHEN p_estado = 'listo' THEN v_usuario ELSE listo_por END
  WHERE id = p_item_id;

  INSERT INTO public.pedido_item_eventos (tenant_id, pedido_id, item_id, estado, actor_id)
  VALUES (v_tenant, v_item.pedido_id, p_item_id, p_estado, v_usuario);

  -- Estado agregado del pedido, derivado de sus ítems (estadoPedidoDesdeItems).
  SELECT bool_and(estado = 'listo'), bool_or(estado = 'en_preparacion')
    INTO v_todos_listos, v_alguno_en_prep
  FROM public.pedido_items
  WHERE pedido_id = v_item.pedido_id AND tenant_id = v_tenant;

  v_estado_nuevo := CASE
    WHEN v_pedido.estado IN ('entregado', 'cancelado') THEN v_pedido.estado
    WHEN v_todos_listos    THEN 'despachado'
    WHEN v_alguno_en_prep  THEN 'en_preparacion'
    WHEN v_pedido.estado = 'creado' THEN 'creado'
    ELSE 'recibido_cocina'
  END;

  UPDATE public.pedidos
  SET estado = v_estado_nuevo, version = version + 1, updated_at = now()
  WHERE id = v_item.pedido_id;

  IF v_estado_nuevo <> v_pedido.estado THEN
    INSERT INTO public.pedido_eventos (tenant_id, pedido_id, estado, actor_id)
    VALUES (v_tenant, v_item.pedido_id, v_estado_nuevo, v_usuario);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'item_id', p_item_id, 'pedido_id', v_item.pedido_id,
    'item_estado_anterior', v_item.estado, 'item_estado', p_estado,
    'area', v_item.area_produccion, 'zona', v_pedido.zona,
    'pedido_estado_anterior', v_pedido.estado, 'pedido_estado', v_estado_nuevo,
    'pedido_version', p_version + 1);
END;
$$;


-- ── fn_crear_pedido: pasa a SECURITY DEFINER con autorización propia ─────────
-- Era SECURITY INVOKER y se apoyaba en la RLS para el INSERT. Al revocar el
-- INSERT de tabla (abajo) necesita autorizar por sí misma. Deriva el tenant del
-- JWT en lugar de aceptarlo como parámetro.
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido_id uuid;
  v_item      jsonb;
  v_tenant    uuid := public.fn_jwt_tenant();
BEGIN
  IF v_tenant IS NULL OR NOT public.fn_puede('orders:create') THEN
    RAISE EXCEPTION 'Sin permiso orders:create' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El tenant del parámetro es informativo: manda el del JWT.
  IF p_tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'El tenant del pedido no coincide con la sesión'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_zona_permitida_para_rol(p_zona) THEN
    RAISE EXCEPTION 'El rol "%" no puede operar la zona "%"', public.fn_jwt_role(), p_zona
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Un pedido debe tener al menos un ítem' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.pedidos
    (tenant_id, responsable_id, zona, numero_mesa, notas, idempotency_key, turno_id)
  VALUES
    (v_tenant, p_responsable_id, p_zona, p_numero_mesa, p_notas, p_idempotency_key, p_turno_id)
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.pedido_items
      (tenant_id, pedido_id, receta_id, cantidad, notas, area_produccion)
    VALUES (
      v_tenant,
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


-- ── Cierre: la RPC es el único camino de escritura ───────────────────────────
DROP POLICY IF EXISTS "pedidos_modify_mesero"      ON public.pedidos;
DROP POLICY IF EXISTS "pedido_items_modify_mesero" ON public.pedido_items;

-- Las políticas de SELECT (pedidos_select_staff, pedido_items_select_staff,
-- pedido_eventos_tenant_select, pedido_item_eventos_tenant_select) se conservan.
DROP POLICY IF EXISTS "pedido_eventos_tenant_insert"      ON public.pedido_eventos;
DROP POLICY IF EXISTS "pedido_item_eventos_tenant_insert" ON public.pedido_item_eventos;

REVOKE INSERT, UPDATE ON TABLE public.pedidos             FROM anon, authenticated;
REVOKE INSERT, UPDATE ON TABLE public.pedido_items        FROM anon, authenticated;
REVOKE INSERT, UPDATE ON TABLE public.pedido_eventos      FROM anon, authenticated;
REVOKE INSERT, UPDATE ON TABLE public.pedido_item_eventos FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_pedido_transicion(uuid, public.estado_pedido, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pedido_transicion(uuid, public.estado_pedido, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_pedido_asignar_cocinero(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pedido_asignar_cocinero(uuid, uuid, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_entregar_pedido(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_entregar_pedido(uuid, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_transicionar_item(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_transicionar_item(uuid, text, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_crear_pedido(
  uuid, uuid, public.zona_servicio, text, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_crear_pedido(
  uuid, uuid, public.zona_servicio, text, text, text, uuid, jsonb)
  TO authenticated, service_role;

-- =============================================================================
-- ROLLBACK (manual):
--   GRANT INSERT, UPDATE ON public.pedidos, public.pedido_items,
--         public.pedido_eventos, public.pedido_item_eventos TO authenticated;
--   Reaplicar las políticas de 20260611100000_snack_buffet_rls_tanda_link.sql,
--   20260527000001 y 20260601000001, y la versión SECURITY INVOKER de
--   fn_crear_pedido (20260530000004).
--   NO RECOMENDADO: reabre el bypass del Principio Rector (F-002).
-- =============================================================================
