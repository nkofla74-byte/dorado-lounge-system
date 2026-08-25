-- F-037: la flecha capa_1 → capa_2 nunca se ejecutaba.
--
-- `fn_completar_tanda` descontaba los ingredientes y cerraba la tanda, pero no
-- creaba el lote del producto elaborado. Los amasijos y postres terminados no
-- existían como stock: no se sabía cuántos había, no había de qué descontar lo
-- que se consumía, y no se podía mermar lo que se botaba.
DO $$
DECLARE
  v_tenant   uuid := '11111111-1111-1111-1111-111111111111';
  v_tanda    uuid := '99999999-0000-0000-0000-0000000f0037';
  v_receta   uuid := 'eeeeeeee-0000-0000-0000-000000000009';  -- producción
  v_harina   uuid := 'cccccccc-0000-0000-0000-000000000001';  -- capa_1
  v_base     uuid := 'cccccccc-0000-0000-0000-000000000002';  -- capa_2
  v_res      jsonb;
  v_harina_antes  numeric;
  v_harina_despues numeric;
  v_stock_capa2   numeric;
  v_lotes_capa2   int;
  v_costo         numeric;
BEGIN
  SELECT COALESCE(SUM(cantidad_actual), 0) INTO v_harina_antes
  FROM public.lotes WHERE insumo_id = v_harina AND activo AND deleted_at IS NULL;

  INSERT INTO public.tandas_produccion
    (id, tenant_id, receta_id, turno_id, cantidad_tandas, estado, responsable_id, idempotency_key)
  VALUES
    (v_tanda, v_tenant, v_receta, 'ffffffff-0000-0000-0000-000000000001', 2, 'en_proceso',
     'aaaaaaaa-0000-0000-0000-000000000002', 'f037-tanda');

  v_res := public.fn_completar_tanda(
    p_tanda_id     := v_tanda,
    p_tenant_id    := v_tenant,
    p_usuario_id   := 'aaaaaaaa-0000-0000-0000-000000000002',
    p_ingredientes := jsonb_build_array(
      jsonb_build_object('insumo_id', v_harina, 'cantidad_bruta', 200, 'insumo_nombre', 'Harina')
    )
  );

  PERFORM test.assert((v_res ->> 'ok')::boolean, 'fn_completar_tanda falló: ' || v_res::text);

  -- 1. El consumo de capa 1 sigue ocurriendo (no se rompe lo que ya funcionaba).
  SELECT COALESCE(SUM(cantidad_actual), 0) INTO v_harina_despues
  FROM public.lotes WHERE insumo_id = v_harina AND activo AND deleted_at IS NULL;

  PERFORM test.assert(
    v_harina_antes - v_harina_despues = 200,
    format('la harina debía bajar 200 g y bajó %s', v_harina_antes - v_harina_despues));

  -- 2. EL FALLO: el producto elaborado tiene que existir como stock.
  SELECT COUNT(*), COALESCE(SUM(cantidad_actual), 0)
  INTO v_lotes_capa2, v_stock_capa2
  FROM public.lotes WHERE insumo_id = v_base AND activo AND deleted_at IS NULL;

  PERFORM test.assert(
    v_lotes_capa2 = 1,
    format('completar la tanda debía crear 1 lote de capa 2 y creó %s', v_lotes_capa2));

  -- rendimiento 20 por tanda × 2 tandas = 40
  PERFORM test.assert(
    v_stock_capa2 = 40,
    format('el stock de capa 2 debía ser 40 y es %s', v_stock_capa2));

  -- 3. El coste viaja con el producto: 200 g × 10 = 2000 repartidos en 40 → 50.
  SELECT costo_unitario INTO v_costo
  FROM public.lotes WHERE insumo_id = v_base AND activo AND deleted_at IS NULL;

  PERFORM test.assert(
    v_costo = 50,
    format('el costo unitario del elaborado debía ser 50 y es %s', v_costo));

  -- 4. El movimiento queda en el ledger, con su turno y su referencia.
  PERFORM test.assert(
    EXISTS (
      SELECT 1 FROM public.movimientos_inventario
      WHERE referencia_id = v_tanda AND referencia_tipo = 'tanda'
        AND insumo_id = v_base AND cantidad > 0
        AND turno_id = 'ffffffff-0000-0000-0000-000000000001'
    ),
    'la entrada de capa 2 no quedó registrada en movimientos_inventario');
END $$;
