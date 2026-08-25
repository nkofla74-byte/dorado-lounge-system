-- F-009 (RC-3): transitionItem confirmaba el UPDATE del ítem y el INSERT del
-- evento antes de comprobar la versión del pedido, así que un 409 devolvía
-- "recarga e intenta de nuevo" con el ítem ya modificado.
DO $$
DECLARE
  v_pedido uuid := '99999999-0000-0000-0000-00000000001a';
  v_item   uuid;
  v_sqlstate text;
BEGIN
  INSERT INTO public.pedidos (id, tenant_id, responsable_id, zona, estado, version, turno_id, idempotency_key)
  VALUES (v_pedido, '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000002', 'amex', 'creado', 1,
          'ffffffff-0000-0000-0000-000000000001', 'idem-item-1');
  INSERT INTO public.pedido_items (tenant_id, pedido_id, receta_id, cantidad, area_produccion, estado)
  VALUES ('11111111-1111-1111-1111-111111111111', v_pedido,
          'eeeeeeee-0000-0000-0000-000000000001', 1, 'cocina_fria', 'pendiente')
  RETURNING id INTO v_item;

  -- Versión equivocada: la transacción entera debe abortar.
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000003');  -- chef_cocina_fria
  v_sqlstate := test.expect_error(
    format('SELECT public.fn_transicionar_item(%L, %L, 99)', v_item, 'en_preparacion'));
  PERFORM test.logout();

  PERFORM test.assert(v_sqlstate = '40001',
    'se esperaba conflicto de versión, llegó: ' || COALESCE(v_sqlstate, 'ningún error'));
  PERFORM test.assert(
    (SELECT estado FROM public.pedido_items WHERE id = v_item) = 'pendiente',
    'el ítem quedó modificado pese al conflicto de versión');
  PERFORM test.assert(
    (SELECT count(*) FROM public.pedido_item_eventos WHERE item_id = v_item) = 0,
    'se registró un evento de ítem pese al conflicto de versión');
END $$;

-- Camino feliz: ítem, evento y estado agregado del pedido se mueven juntos.
DO $$
DECLARE
  v_pedido uuid := '99999999-0000-0000-0000-00000000001b';
  v_item   uuid;
  v_res    jsonb;
BEGIN
  INSERT INTO public.pedidos (id, tenant_id, responsable_id, zona, estado, version, turno_id, idempotency_key)
  VALUES (v_pedido, '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000002', 'amex', 'creado', 1,
          'ffffffff-0000-0000-0000-000000000001', 'idem-item-2');
  INSERT INTO public.pedido_items (tenant_id, pedido_id, receta_id, cantidad, area_produccion, estado)
  VALUES ('11111111-1111-1111-1111-111111111111', v_pedido,
          'eeeeeeee-0000-0000-0000-000000000001', 1, 'cocina_fria', 'pendiente')
  RETURNING id INTO v_item;

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000003');
  v_res := public.fn_transicionar_item(v_item, 'en_preparacion', 1);
  PERFORM test.logout();

  PERFORM test.assert((SELECT estado FROM public.pedido_items WHERE id = v_item) = 'en_preparacion',
    'el ítem no avanzó');
  PERFORM test.assert((SELECT count(*) FROM public.pedido_item_eventos WHERE item_id = v_item) = 1,
    'no se registró el evento del ítem');
  PERFORM test.assert(v_res ->> 'pedido_estado' = 'en_preparacion',
    'el estado agregado del pedido no se derivó');
  PERFORM test.assert((SELECT estado FROM public.pedidos WHERE id = v_pedido) = 'en_preparacion',
    'el pedido no reflejó el estado derivado');

  -- Único ítem listo => pedido despachado.
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000003');
  v_res := public.fn_transicionar_item(v_item, 'listo', 2);
  PERFORM test.logout();

  PERFORM test.assert((SELECT estado FROM public.pedidos WHERE id = v_pedido) = 'despachado',
    'con todos los ítems listos el pedido debía quedar despachado');
END $$;

-- Un chef no puede despachar ítems de un área ajena (guarda de área en la base).
DO $$
DECLARE
  v_pedido uuid := '99999999-0000-0000-0000-00000000001c';
  v_item   uuid;
  v_sqlstate text;
BEGIN
  INSERT INTO public.pedidos (id, tenant_id, responsable_id, zona, estado, version, turno_id, idempotency_key)
  VALUES (v_pedido, '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000002', 'amex', 'creado', 1,
          'ffffffff-0000-0000-0000-000000000001', 'idem-item-3');
  INSERT INTO public.pedido_items (tenant_id, pedido_id, receta_id, cantidad, area_produccion, estado)
  VALUES ('11111111-1111-1111-1111-111111111111', v_pedido,
          'eeeeeeee-0000-0000-0000-000000000002', 1, 'cocina_caliente', 'pendiente')
  RETURNING id INTO v_item;

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000003');  -- chef_cocina_fria
  v_sqlstate := test.expect_error(
    format('SELECT public.fn_transicionar_item(%L, %L, 1)', v_item, 'en_preparacion'));
  PERFORM test.logout();

  PERFORM test.assert(v_sqlstate = '42501',
    'chef_cocina_fria despachó un ítem de cocina_caliente');
END $$;
