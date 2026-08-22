-- F-022 (RC-3): el descuento FEFO y el registro de merma ocurrían en dos
-- transacciones separadas. Si fallaba el segundo, el stock quedaba descontado
-- sin registro de merma y descuadraba total_merma en la analítica.
DO $$
DECLARE
  v_stock_antes numeric;
  v_res jsonb;
BEGIN
  SELECT cantidad_actual INTO v_stock_antes
  FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001';

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000005');  -- personal_almacen
  v_res := public.fn_registrar_merma(
    'cccccccc-0000-0000-0000-000000000001', 25, 'operativa', 'prueba', 'merma-1',
    'ffffffff-0000-0000-0000-000000000001');
  PERFORM test.logout();

  PERFORM test.assert((v_res ->> 'ok')::boolean, 'fn_registrar_merma no devolvió ok');
  PERFORM test.assert(
    (SELECT cantidad_actual FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001')
      = v_stock_antes - 25,
    'el stock no se descontó');
  PERFORM test.assert(
    (SELECT count(*) FROM public.mermas WHERE idempotency_key = 'merma-1') = 1,
    'no se registró la merma');
  PERFORM test.assert(
    (SELECT count(*) FROM public.movimientos_inventario
      WHERE idempotency_key = 'merma-1'
        AND turno_id = 'ffffffff-0000-0000-0000-000000000001') = 1,
    'el movimiento de merma no quedó vinculado al turno');
END $$;

-- Sin stock suficiente no se descuenta nada ni se registra merma.
DO $$
DECLARE
  v_stock_antes numeric;
  v_sqlstate text;
BEGIN
  SELECT cantidad_actual INTO v_stock_antes
  FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001';

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000005');
  v_sqlstate := test.expect_error(
    $q$SELECT public.fn_registrar_merma('cccccccc-0000-0000-0000-000000000001',
        999999, 'operativa', 'exceso', 'merma-2', NULL)$q$);
  PERFORM test.logout();

  PERFORM test.assert(v_sqlstate = 'P0001',
    'se esperaba stock insuficiente, llegó: ' || COALESCE(v_sqlstate, 'ningún error'));
  PERFORM test.assert(
    (SELECT cantidad_actual FROM public.lotes WHERE id = 'dddddddd-0000-0000-0000-000000000001')
      = v_stock_antes,
    'quedó stock descontado tras una merma fallida');
  PERFORM test.assert(
    (SELECT count(*) FROM public.mermas WHERE idempotency_key = 'merma-2') = 0,
    'se registró una merma pese al fallo');
END $$;

-- Un rol sin inventory:merma no puede registrar mermas.
DO $$
DECLARE v_sqlstate text;
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- mesero_amex
  v_sqlstate := test.expect_error(
    $q$SELECT public.fn_registrar_merma('cccccccc-0000-0000-0000-000000000001',
        1, 'operativa', 'pirata', 'merma-3', NULL)$q$);
  PERFORM test.logout();

  PERFORM test.assert(v_sqlstate = '42501', 'un mesero_amex registró una merma');
END $$;
