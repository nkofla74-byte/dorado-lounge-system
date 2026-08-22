-- F-002 (RC-1): "Nada sale de cocina sin receta".
-- Ningún rol puede marcar un pedido como entregado por escritura directa a
-- PostgREST: la entrega es una RPC que descuenta stock en la misma transacción.
DO $$
DECLARE v_pedido uuid := '99999999-0000-0000-0000-00000000000a';
BEGIN
  INSERT INTO public.pedidos (id, tenant_id, responsable_id, zona, estado, version, turno_id, idempotency_key)
  VALUES (v_pedido, '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000002', 'amex', 'creado', 1,
          'ffffffff-0000-0000-0000-000000000001', 'f002-rector');
  UPDATE public.pedidos SET estado = 'en_preparacion' WHERE id = v_pedido;
  UPDATE public.pedidos SET estado = 'despachado'     WHERE id = v_pedido;

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- mesero_amex

  PERFORM test.assert(
    test.exec_count(format($q$UPDATE public.pedidos SET estado='entregado' WHERE id=%L$q$, v_pedido)) <= 0,
    'un mesero marcó el pedido como entregado por escritura directa (bypass del FEFO)');

  PERFORM test.logout();

  PERFORM test.assert(
    (SELECT estado FROM public.pedidos WHERE id = v_pedido) = 'despachado',
    'el estado del pedido cambió pese a la denegación');
END $$;
