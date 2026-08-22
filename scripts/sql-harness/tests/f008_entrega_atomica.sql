-- F-008 (RC-3): la entrega descontaba el FEFO en llamadas independientes y solo
-- después intentaba el cambio de estado. Un fallo intermedio dejaba stock
-- descontado sin pedido entregado. Ahora todo ocurre en fn_entregar_pedido.

-- Helper local: deja un pedido de zona amex en estado 'despachado'.
CREATE OR REPLACE FUNCTION pg_temp.pedido_despachado(p_id uuid, p_cantidad int)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO public.pedidos (id, tenant_id, responsable_id, zona, estado, version, turno_id, idempotency_key)
  VALUES (p_id, '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000002', 'amex', 'creado', 1,
          'ffffffff-0000-0000-0000-000000000001', 'idem-' || p_id);
  INSERT INTO public.pedido_items (tenant_id, pedido_id, receta_id, cantidad, area_produccion, estado)
  VALUES ('11111111-1111-1111-1111-111111111111', p_id,
          'eeeeeeee-0000-0000-0000-000000000001', p_cantidad, 'cocina_fria', 'listo');
  UPDATE public.pedidos SET estado = 'en_preparacion' WHERE id = p_id;
  UPDATE public.pedidos SET estado = 'despachado', version = 3 WHERE id = p_id;
END $fn$;

-- Camino feliz: descuenta y transiciona en la misma transacción.
DO $$
DECLARE
  v_pedido uuid := '99999999-0000-0000-0000-00000000000b';
  v_stock_antes numeric;
  v_res jsonb;
BEGIN
  PERFORM pg_temp.pedido_despachado(v_pedido, 2);  -- 2 x 50 g = 100 g
  SELECT cantidad_actual INTO v_stock_antes
  FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001';

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- mesero_amex
  v_res := public.fn_entregar_pedido(v_pedido, 3);
  PERFORM test.logout();

  PERFORM test.assert((v_res ->> 'ok')::boolean, 'fn_entregar_pedido no devolvió ok');
  PERFORM test.assert(
    (SELECT estado FROM public.pedidos WHERE id = v_pedido) = 'entregado',
    'el pedido no quedó entregado');
  PERFORM test.assert(
    (SELECT cantidad_actual FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001')
      = v_stock_antes - 100,
    'el descuento FEFO no coincide con la receta');
  PERFORM test.assert(
    (SELECT count(*) FROM public.movimientos_inventario
      WHERE referencia_id = v_pedido AND referencia_tipo = 'pedido') > 0,
    'no se registró el movimiento de inventario del pedido');
END $$;

-- Sin stock suficiente: no se descuenta NADA y el pedido no se entrega.
DO $$
DECLARE
  v_pedido uuid := '99999999-0000-0000-0000-00000000000c';
  v_stock_antes numeric;
  v_sqlstate text;
BEGIN
  -- 100 unidades x 50 g = 5000 g, muy por encima de los 1000 g del lote.
  PERFORM pg_temp.pedido_despachado(v_pedido, 100);
  SELECT cantidad_actual INTO v_stock_antes
  FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001';

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');
  v_sqlstate := test.expect_error(format('SELECT public.fn_entregar_pedido(%L, 3)', v_pedido));
  PERFORM test.logout();

  PERFORM test.assert(v_sqlstate = 'P0001',
    'se esperaba stock insuficiente (P0001), llegó: ' || COALESCE(v_sqlstate, 'ningún error'));
  PERFORM test.assert(
    (SELECT estado FROM public.pedidos WHERE id = v_pedido) = 'despachado',
    'el pedido se entregó pese al fallo de stock');
  PERFORM test.assert(
    (SELECT cantidad_actual FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001')
      = v_stock_antes,
    'quedó stock descontado tras una entrega fallida');
END $$;

-- Conflicto de versión: tampoco descuenta.
DO $$
DECLARE
  v_pedido uuid := '99999999-0000-0000-0000-00000000000d';
  v_stock_antes numeric;
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.pedido_despachado(v_pedido, 1);
  SELECT cantidad_actual INTO v_stock_antes
  FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001';

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');
  v_sqlstate := test.expect_error(format('SELECT public.fn_entregar_pedido(%L, 99)', v_pedido));
  PERFORM test.logout();

  PERFORM test.assert(v_sqlstate = '40001',
    'se esperaba conflicto de versión, llegó: ' || COALESCE(v_sqlstate, 'ningún error'));
  PERFORM test.assert(
    (SELECT cantidad_actual FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001')
      = v_stock_antes,
    'se descontó stock pese al conflicto de versión');
END $$;

-- La guarda de zona sigue vigente dentro de la RPC.
DO $$
DECLARE
  v_pedido uuid := '99999999-0000-0000-0000-00000000000e';
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.pedido_despachado(v_pedido, 1);
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000007');  -- personal_snack sobre zona amex
  v_sqlstate := test.expect_error(format('SELECT public.fn_entregar_pedido(%L, 3)', v_pedido));
  PERFORM test.logout();

  PERFORM test.assert(v_sqlstate = '42501',
    'personal_snack entregó un pedido de zona amex');
END $$;
