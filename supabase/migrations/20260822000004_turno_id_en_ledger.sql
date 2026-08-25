-- =============================================================================
-- 20260822000004_turno_id_en_ledger.sql
--
-- HALLAZGO F-004 (HIGH, causa raíz RC-4) — auditoría forense 2026-08-22.
--
-- `movimientos_inventario.turno_id` existe desde 0003, tiene FK (0006) e índice
-- (20260527000000), pero NINGUNA ruta de escritura lo poblaba nunca:
--   · fn_descontar_insumo_fefo no lo tenía siquiera como parámetro;
--   · el INSERT manual de createLote tampoco lo incluía.
-- La vista materializada mv_consumo_vs_produccion_turno hace
--   JOIN movimientos_inventario m ON m.turno_id = t.id
-- así que con la columna siempre NULL el INNER JOIN devuelve cero filas y todo
-- el módulo Analytics informa vacío. También incumple la regla de CLAUDE.md
-- "todo movimiento de inventario está vinculado al turno activo".
--
-- ESTE FIX añade p_turno_id a fn_descontar_insumo_fefo y lo escribe en el ledger.
--
-- ATENCIÓN — DDL destructivo deliberado: NO se usa CREATE OR REPLACE para añadir
-- el parámetro. PostgreSQL trataría la firma nueva como un OVERLOAD y dejaría la
-- vieja huérfana; ese error exacto (overload sin REVOKE, ejecutable por
-- authenticated) fue el hallazgo crítico corregido en 20260615000000. Se hace
-- DROP explícito de la firma de 8 argumentos y se crea una única de 9.
-- fn_completar_tanda, su único llamador SQL, se recrea en la misma migración.
--
-- Idempotente: DROP ... IF EXISTS + CREATE OR REPLACE.
-- =============================================================================

DROP FUNCTION IF EXISTS public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, public.tipo_movimiento, uuid, text, uuid
);

CREATE OR REPLACE FUNCTION public.fn_descontar_insumo_fefo(
  p_tenant_id       uuid,
  p_insumo_id       uuid,
  p_cantidad        numeric,
  p_idempotency_key text,
  p_tipo            public.tipo_movimiento DEFAULT 'salida_receta',
  p_referencia_id   uuid    DEFAULT NULL,
  p_referencia_tipo text    DEFAULT NULL,
  p_usuario_id      uuid    DEFAULT NULL,
  p_turno_id        uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restante        numeric := p_cantidad;
  v_lote            RECORD;
  v_descuento       numeric;
  v_operacion_id    uuid    := gen_random_uuid();
  v_lotes_afectados uuid[]  := '{}';
  v_resultado       jsonb;
  v_existente       jsonb;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad a descontar debe ser positiva, recibido: %', p_cantidad
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT resultado INTO v_existente
  FROM public.operaciones_idempotentes
  WHERE clave = p_idempotency_key;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  IF (
    SELECT COALESCE(SUM(cantidad_actual), 0)
    FROM public.lotes
    WHERE tenant_id = p_tenant_id
      AND insumo_id = p_insumo_id
      AND activo = true
      AND deleted_at IS NULL
      AND cantidad_actual > 0
      AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
  ) < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para insumo %. Solicitado: %, Disponible: %',
      p_insumo_id,
      p_cantidad,
      (SELECT COALESCE(SUM(cantidad_actual), 0) FROM public.lotes
       WHERE tenant_id = p_tenant_id AND insumo_id = p_insumo_id
         AND activo = true AND deleted_at IS NULL
         AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE))
    USING ERRCODE = 'P0001';
  END IF;

  FOR v_lote IN
    SELECT id, cantidad_actual
    FROM public.lotes
    WHERE tenant_id = p_tenant_id
      AND insumo_id = p_insumo_id
      AND activo = true
      AND deleted_at IS NULL
      AND cantidad_actual > 0
      AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
    ORDER BY
      fecha_vencimiento ASC NULLS LAST,
      created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;

    v_descuento := LEAST(v_lote.cantidad_actual, v_restante);

    UPDATE public.lotes
    SET cantidad_actual = cantidad_actual - v_descuento,
        updated_at      = now()
    WHERE id = v_lote.id;

    INSERT INTO public.movimientos_inventario (
      tenant_id, insumo_id, lote_id, tipo, cantidad, operacion_id,
      referencia_id, referencia_tipo, idempotency_key, usuario_id, turno_id
    ) VALUES (
      p_tenant_id,
      p_insumo_id,
      v_lote.id,
      p_tipo,
      -v_descuento,
      v_operacion_id,
      p_referencia_id,
      p_referencia_tipo,
      CASE WHEN v_restante = p_cantidad THEN p_idempotency_key ELSE NULL END,
      p_usuario_id,
      p_turno_id          -- F-004: vincula el movimiento al turno activo
    );

    v_lotes_afectados := array_append(v_lotes_afectados, v_lote.id);
    v_restante := v_restante - v_descuento;
  END LOOP;

  IF v_restante > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente mid-transaction para insumo %', p_insumo_id
      USING ERRCODE = 'P0001';
  END IF;

  v_resultado := jsonb_build_object(
    'ok',                  true,
    'insumo_id',           p_insumo_id,
    'cantidad_descontada', p_cantidad,
    'lotes_afectados',     to_jsonb(v_lotes_afectados),
    'operacion_id',        v_operacion_id,
    'turno_id',            p_turno_id,
    'idempotency_key',     p_idempotency_key
  );

  INSERT INTO public.operaciones_idempotentes (clave, resultado)
  VALUES (p_idempotency_key, v_resultado)
  ON CONFLICT (clave) DO NOTHING;

  IF NOT FOUND THEN
    SELECT resultado INTO v_resultado
    FROM public.operaciones_idempotentes
    WHERE clave = p_idempotency_key;
  END IF;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, public.tipo_movimiento, uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, public.tipo_movimiento, uuid, text, uuid, uuid)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, public.tipo_movimiento, uuid, text, uuid, uuid) TO service_role;


-- ── fn_completar_tanda: propaga el turno de la tanda al ledger ───────────────
CREATE OR REPLACE FUNCTION public.fn_completar_tanda(
  p_tanda_id      uuid,
  p_tenant_id     uuid,
  p_usuario_id    uuid,
  p_ingredientes  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tanda        RECORD;
  v_ing          jsonb;
  v_idem_key     text;
  v_rpc_result   jsonb;
BEGIN
  SELECT id, estado, turno_id INTO v_tanda
  FROM public.tandas_produccion
  WHERE id = p_tanda_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TANDA_NOT_FOUND');
  END IF;

  IF v_tanda.estado <> 'en_proceso' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_STATE',
                              'estado', v_tanda.estado::text);
  END IF;

  FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredientes)
  LOOP
    v_idem_key := 'tanda:' || p_tanda_id || ':ing:' || (v_ing ->> 'insumo_id');

    v_rpc_result := public.fn_descontar_insumo_fefo(
      p_tenant_id       := p_tenant_id,
      p_insumo_id       := (v_ing ->> 'insumo_id')::uuid,
      p_cantidad        := (v_ing ->> 'cantidad_bruta')::numeric(12,4),
      p_idempotency_key := v_idem_key,
      p_tipo            := 'salida_receta'::public.tipo_movimiento,
      p_referencia_id   := p_tanda_id,
      p_referencia_tipo := 'tanda',
      p_usuario_id      := p_usuario_id,
      p_turno_id        := v_tanda.turno_id   -- F-004
    );

    IF v_rpc_result IS NULL OR NOT (v_rpc_result ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'Stock insuficiente para: %', (v_ing ->> 'insumo_nombre')
      USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  UPDATE public.tandas_produccion
  SET estado = 'completada', completed_at = now(), updated_at = now()
  WHERE id = p_tanda_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_completar_tanda(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_completar_tanda(uuid, uuid, uuid, jsonb)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_completar_tanda(uuid, uuid, uuid, jsonb) TO service_role;

-- =============================================================================
-- ROLLBACK (manual, gate del dueño): reaplicar 20260615000000 (firma de 8
-- argumentos) y 20260527000002 (fn_completar_tanda sin p_turno_id). Analytics
-- volvería a quedar vacío.
-- =============================================================================
