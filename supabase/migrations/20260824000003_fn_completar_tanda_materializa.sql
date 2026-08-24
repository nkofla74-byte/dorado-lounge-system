-- =============================================================================
-- 20260824000003_fn_completar_tanda_materializa.sql
--
-- HALLAZGO F-037 — parte 3 de 3.
--
-- `fn_completar_tanda` descontaba los ingredientes de capa 1 y cerraba la tanda,
-- pero nunca creaba el lote del producto elaborado. Verificado contra Postgres:
-- al completar una tanda la harina bajaba de 1000 a 900 g y el elaborado seguía
-- en 0, sin ningún lote.
--
-- Consecuencia operativa: los amasijos y postres terminados no existían como
-- stock. No se sabía cuántos había, no había de qué descontar lo que se
-- consumía, y no se podía mermar lo que se botaba. Es el prerrequisito del
-- conteo de barra al cierre de turno.
--
-- Idempotente: CREATE OR REPLACE (la firma no cambia, así que no deja overload
-- huérfano — regla 11 de CLAUDE.md).
-- =============================================================================

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
  v_tanda           RECORD;
  v_receta          RECORD;
  v_ing             jsonb;
  v_idem_key        text;
  v_rpc_result      jsonb;
  v_producido       numeric(12,4);
  v_costo_total     numeric(14,4);
  v_costo_unitario  numeric(14,4);
  v_lote_id         uuid;
BEGIN
  SELECT id, estado, turno_id, receta_id, cantidad_tandas INTO v_tanda
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

  SELECT tipo_receta, insumo_destino_id, rendimiento_cantidad INTO v_receta
  FROM public.recetas
  WHERE id = v_tanda.receta_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RECETA_NOT_FOUND');
  END IF;

  -- Falla en cerrado ANTES de tocar el stock: si la receta de producción no
  -- declara rendimiento no hay forma de materializar la salida, y completar la
  -- tanda consumiría capa 1 sin producir capa 2 — exactamente el agujero de
  -- F-037. Preferible negarse y que alguien complete la receta.
  IF v_receta.insumo_destino_id IS NOT NULL
     AND (v_receta.rendimiento_cantidad IS NULL OR v_receta.rendimiento_cantidad <= 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RECETA_SIN_RENDIMIENTO',
                              'receta_id', v_tanda.receta_id);
  END IF;

  -- ── Consumo de capa 1 ─────────────────────────────────────────────────────
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

  -- ── Materialización de capa 2 (F-037) ─────────────────────────────────────
  -- Solo las recetas con destino producen stock. Una receta de servicio
  -- ejecutada como tanda consume y no deja producto: ese caso sigue igual.
  IF v_receta.insumo_destino_id IS NOT NULL THEN
    -- Guarda de idempotencia además del bloqueo de estado: si esta tanda ya
    -- materializó su salida, no se duplica el lote bajo ninguna circunstancia.
    IF EXISTS (
      SELECT 1 FROM public.movimientos_inventario
      WHERE tenant_id = p_tenant_id
        AND referencia_id = p_tanda_id
        AND referencia_tipo = 'tanda'
        AND tipo = 'produccion'::public.tipo_movimiento
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'YA_MATERIALIZADA');
    END IF;

    v_producido := v_receta.rendimiento_cantidad * v_tanda.cantidad_tandas;

    -- El costo del elaborado es el de lo que se consumió para hacerlo. Se
    -- reconstruye del ledger que la FEFO acaba de escribir en ESTA transacción:
    -- ahí está el lote concreto del que salió cada gramo, con su costo real.
    -- No se estima con un precio medio ni con el último precio de compra.
    SELECT COALESCE(SUM(-m.cantidad * l.costo_unitario), 0)
    INTO v_costo_total
    FROM public.movimientos_inventario m
    JOIN public.lotes l ON l.id = m.lote_id
    WHERE m.tenant_id     = p_tenant_id
      AND m.referencia_id = p_tanda_id
      AND m.referencia_tipo = 'tanda'
      AND m.cantidad < 0;

    -- NULLIF: `lotes.costo_unitario` exige > 0. Si los insumos consumidos no
    -- tenían costo registrado, el elaborado queda sin costo en lugar de
    -- inventarse un cero que ensuciaría la analítica.
    v_costo_unitario := NULLIF(round(v_costo_total / v_producido, 4), 0);

    INSERT INTO public.lotes (
      tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual,
      fecha_recibido, fecha_vencimiento, costo_unitario
    ) VALUES (
      p_tenant_id,
      v_receta.insumo_destino_id,
      public.fn_siguiente_codigo_lote(p_tenant_id),
      v_producido,
      v_producido,
      CURRENT_DATE,
      -- Sin fecha de vencimiento a propósito. Lo que sobra en barra se conserva
      -- o se descarta por decisión en el momento del conteo de cierre, no por
      -- una caducidad fija de la receta. Ponerle una fecha inventaría una regla
      -- de negocio que el dueño no definió así.
      NULL,
      v_costo_unitario
    )
    RETURNING id INTO v_lote_id;

    INSERT INTO public.movimientos_inventario (
      tenant_id, insumo_id, lote_id, tipo, cantidad,
      referencia_id, referencia_tipo, idempotency_key, usuario_id, turno_id
    ) VALUES (
      p_tenant_id,
      v_receta.insumo_destino_id,
      v_lote_id,
      'produccion'::public.tipo_movimiento,
      v_producido,                     -- positivo: es una entrada
      p_tanda_id,
      'tanda',
      'tanda:' || p_tanda_id || ':produccion',
      p_usuario_id,
      v_tanda.turno_id
    );
  END IF;

  UPDATE public.tandas_produccion
  SET estado = 'completada', completed_at = now(), updated_at = now()
  WHERE id = p_tanda_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'lote_producido_id', v_lote_id,
    'cantidad_producida', v_producido,
    'costo_unitario', v_costo_unitario
  );
END;
$$;

-- =============================================================================
-- ROLLBACK (manual): reaplicar el cuerpo de 20260822000004_turno_id_en_ledger.sql.
-- Volvería a dejar la capa 2 sin materializar (F-037).
-- =============================================================================
