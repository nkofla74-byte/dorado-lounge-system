-- F-004 (RC-4): movimientos_inventario.turno_id nunca se escribía, así que la
-- vista materializada de analítica (INNER JOIN sobre esa columna) devolvía cero
-- filas y todo el módulo Analytics informaba vacío.
DO $$
DECLARE v_res jsonb;
BEGIN
  v_res := public.fn_descontar_insumo_fefo(
    p_tenant_id       := '11111111-1111-1111-1111-111111111111',
    p_insumo_id       := 'cccccccc-0000-0000-0000-000000000001',
    p_cantidad        := 10,
    p_idempotency_key := 'test-turno-ledger',
    p_tipo            := 'salida_receta'::public.tipo_movimiento,
    p_usuario_id      := 'aaaaaaaa-0000-0000-0000-000000000002',
    p_turno_id        := 'ffffffff-0000-0000-0000-000000000001');

  PERFORM test.assert((v_res ->> 'ok')::boolean, 'el descuento FEFO falló');
  PERFORM test.assert(
    (SELECT count(*) FROM public.movimientos_inventario
      WHERE idempotency_key = 'test-turno-ledger'
        AND turno_id = 'ffffffff-0000-0000-0000-000000000001') = 1,
    'el movimiento no quedó vinculado al turno');
END $$;

-- Con el turno poblado, la vista materializada de consumo por turno proyecta filas.
DO $$
DECLARE v_filas bigint;
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_consumo_vs_produccion_turno;
  SELECT count(*) INTO v_filas FROM public.mv_consumo_vs_produccion_turno;
  PERFORM test.assert(v_filas > 0,
    'la vista de consumo por turno sigue vacía pese a haber movimientos');
END $$;

-- Solo una firma de fn_descontar_insumo_fefo: añadir el parámetro no debe dejar
-- un overload huérfano (la regresión crítica de 20260615000000).
DO $$
DECLARE v_firmas int;
BEGIN
  SELECT count(*) INTO v_firmas
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_descontar_insumo_fefo';

  PERFORM test.assert(v_firmas = 1,
    format('se esperaba 1 firma de fn_descontar_insumo_fefo, hay %s', v_firmas));
END $$;

-- Y sigue sin ser ejecutable por anon/authenticated.
DO $$
BEGIN
  PERFORM test.assert(
    NOT has_function_privilege('authenticated',
      'public.fn_descontar_insumo_fefo(uuid,uuid,numeric,text,public.tipo_movimiento,uuid,text,uuid,uuid)',
      'EXECUTE'),
    'authenticated puede ejecutar fn_descontar_insumo_fefo directamente');
END $$;
