-- =============================================================================
-- 20260615000000_fix_fefo_overload_security.sql
--
-- HALLAZGO CRÍTICO (auditoría 2026-06-15):
-- El fix C-21 (20260527000000) recreó fn_descontar_insumo_fefo cambiando el 5º
-- parámetro de `text` a `public.tipo_movimiento`. Como el tipo del argumento
-- difiere, PostgreSQL NO reemplazó la función: creó un SEGUNDO overload y dejó el
-- viejo (`...text...`) huérfano. El overload nuevo nunca recibió REVOKE/GRANT, por
-- lo que heredó EXECUTE para PUBLIC → ejecutable por `anon`/`authenticated` vía
-- PostgREST RPC. Como la función toma `p_tenant_id` del caller (no del JWT), esto
-- es un vector directo de manipulación de inventario cross-tenant que se salta
-- toda la autorización de Server Actions (assertCan). Es la RPC más sensible del
-- sistema (Principio Rector: "Nada sale de cocina sin receta").
--
-- Además, la reescritura C-21 perdió garantías de la versión original (0008):
--   · validación `p_cantidad <= 0`
--   · idempotencia concurrencia-segura (`INSERT ... ON CONFLICT DO NOTHING` + re-read)
--   · escritura de `idempotency_key` en el ledger `movimientos_inventario`
--
-- ESTE FIX:
--   1. Recrea la firma vigente (enum) restaurando las garantías de 0008 y
--      preservando el filtro de lotes vencidos que sí aportó C-21.
--   2. DROP del overload viejo (`...text...`) huérfano. DDL destructivo con GATE
--      DEL DUEÑO concedido explícitamente (auditoría 2026-06-15).
--   3. REVOKE de PUBLIC/anon/authenticated + GRANT a service_role sobre la firma
--      vigente, cerrando el hueco de permisos.
--
-- Idempotente: CREATE OR REPLACE / DROP ... IF EXISTS / REVOKE / GRANT.
-- =============================================================================

-- ── 1) Firma vigente (enum): garantías 0008 + filtro de vencimiento C-21 ──────
CREATE OR REPLACE FUNCTION public.fn_descontar_insumo_fefo(
  p_tenant_id       uuid,
  p_insumo_id       uuid,
  p_cantidad        numeric,
  p_idempotency_key text,
  p_tipo            public.tipo_movimiento DEFAULT 'salida_receta',
  p_referencia_id   uuid    DEFAULT NULL,
  p_referencia_tipo text    DEFAULT NULL,
  p_usuario_id      uuid    DEFAULT NULL
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
  -- Validación básica (restaurada — C-21 la había perdido).
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad a descontar debe ser positiva, recibido: %', p_cantidad
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotency check ───────────────────────────────────────────────────────
  SELECT resultado INTO v_existente
  FROM public.operaciones_idempotentes
  WHERE clave = p_idempotency_key;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  -- ── Verificar stock disponible antes de bloquear (solo lotes NO vencidos) ────
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

  -- ── FEFO: iterar lotes NO vencidos en orden, con lock ───────────────────────
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

    -- El idempotency_key se escribe solo en la primera fila del grupo (traza de
    -- de-dupe a nivel de ledger — restaurado, C-21 lo había omitido).
    INSERT INTO public.movimientos_inventario (
      tenant_id,
      insumo_id,
      lote_id,
      tipo,
      cantidad,
      operacion_id,
      referencia_id,
      referencia_tipo,
      idempotency_key,
      usuario_id
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
      p_usuario_id
    );

    v_lotes_afectados := array_append(v_lotes_afectados, v_lote.id);
    v_restante := v_restante - v_descuento;
  END LOOP;

  -- Doble check post-loop (no debería alcanzarse por el pre-check; defensa).
  IF v_restante > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente mid-transaction para insumo %', p_insumo_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Registrar idempotencia (concurrencia-segura: ON CONFLICT + re-read) ──────
  v_resultado := jsonb_build_object(
    'ok',                  true,
    'insumo_id',           p_insumo_id,
    'cantidad_descontada', p_cantidad,
    'lotes_afectados',     to_jsonb(v_lotes_afectados),
    'operacion_id',        v_operacion_id,
    'idempotency_key',     p_idempotency_key
  );

  INSERT INTO public.operaciones_idempotentes (clave, resultado)
  VALUES (p_idempotency_key, v_resultado)
  ON CONFLICT (clave) DO NOTHING;

  -- En el raro caso de conflicto (carrera concurrente exacta), devolver el existente.
  IF NOT FOUND THEN
    SELECT resultado INTO v_resultado
    FROM public.operaciones_idempotentes
    WHERE clave = p_idempotency_key;
  END IF;

  RETURN v_resultado;
END;
$$;

-- ── 2) DROP del overload viejo (p_tipo text) huérfano ────────────────────────
-- GATE DEL DUEÑO concedido (auditoría 2026-06-15). Sin callers vivos: el código
-- de la app llama con params nombrados (resuelve a la firma enum) y fn_completar_tanda
-- castea explícitamente a public.tipo_movimiento.
DROP FUNCTION IF EXISTS public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, text, uuid, text, uuid
);

-- ── 3) Cerrar el hueco de permisos sobre la firma vigente (enum) ─────────────
REVOKE ALL ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, public.tipo_movimiento, uuid, text, uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, public.tipo_movimiento, uuid, text, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, public.tipo_movimiento, uuid, text, uuid
) TO service_role;

-- =============================================================================
-- ROLLBACK (manual, gate del dueño):
--   El overload `text` no se restaura automáticamente. Para revertir, reaplicar
--   20260527000000 (recrea la firma enum) y, si se requiere el overload text,
--   reaplicar 20260503132430_0008_rpcs.sql. No recomendado.
-- =============================================================================
