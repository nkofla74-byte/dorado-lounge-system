-- C-04: Atomic FEFO + state transition for tandas_produccion
-- Previously: FEFO deduction loop + state update were separate operations.
-- If FEFO succeeded but state update failed, stock was decremented without
-- a completed tanda record. This RPC wraps both in a single transaction.

CREATE OR REPLACE FUNCTION public.fn_completar_tanda(
  p_tanda_id       uuid,
  p_tenant_id      uuid,
  p_usuario_id     uuid,
  p_ingredientes   jsonb  -- array of {insumo_id, cantidad_bruta, insumo_nombre}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado       public.estado_tanda;
  v_ing          jsonb;
  v_idem_key     text;
  v_rpc_result   jsonb;
BEGIN
  -- Lock the tanda row and verify state
  SELECT estado INTO v_estado
  FROM public.tandas_produccion
  WHERE id = p_tanda_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TANDA_NOT_FOUND');
  END IF;

  IF v_estado <> 'en_proceso' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_STATE', 'estado', v_estado::text);
  END IF;

  -- Deduct ingredients via FEFO (each call is idempotent by key)
  FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredientes)
  LOOP
    v_idem_key := 'tanda:' || p_tanda_id || ':ing:' || (v_ing ->> 'insumo_id');

    v_rpc_result := public.fn_descontar_insumo_fefo(
      p_tenant_id      := p_tenant_id,
      p_insumo_id      := (v_ing ->> 'insumo_id')::uuid,
      p_cantidad        := (v_ing ->> 'cantidad_bruta')::numeric(12,4),
      p_idempotency_key := v_idem_key,
      p_tipo            := 'salida_receta'::public.tipo_movimiento,
      p_referencia_id   := p_tanda_id,
      p_referencia_tipo := 'tanda',
      p_usuario_id      := p_usuario_id
    );

    IF v_rpc_result IS NULL OR NOT (v_rpc_result ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'Stock insuficiente para: %', (v_ing ->> 'insumo_nombre')
      USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Transition state atomically
  UPDATE public.tandas_produccion
  SET
    estado = 'completada',
    completed_at = now(),
    updated_at = now()
  WHERE id = p_tanda_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
