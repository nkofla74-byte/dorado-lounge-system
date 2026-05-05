-- =============================================================================
-- 0008_rpcs.sql
-- RPCs críticos: fn_descontar_insumo_fefo + tabla operaciones_idempotentes
-- Idempotente.
-- =============================================================================

-- ── Tabla: operaciones_idempotentes ───────────────────────────────────────────
-- Registro de operaciones atómicas para garantizar idempotencia en Stock Out,
-- despachos y cualquier operación que modifique inventario.
-- Solo accesible via SECURITY DEFINER functions (service_role bypass RLS).
CREATE TABLE IF NOT EXISTS public.operaciones_idempotentes (
  clave       text        PRIMARY KEY,
  resultado   jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Sin RLS: solo accesible desde funciones SECURITY DEFINER con service_role.
-- Usuarios normales nunca interactúan con esta tabla directamente.


-- ── Función: fn_descontar_insumo_fefo ─────────────────────────────────────────
-- Descuenta `p_cantidad` de un insumo usando política FEFO (First-Expired-First-Out).
-- Garantías:
--   1. Atomicidad: todo o nada. Si no hay stock suficiente → RAISE EXCEPTION.
--   2. Idempotencia: si p_idempotency_key ya existe → devuelve resultado previo.
--   3. FEFO: lotes ordenados por fecha_vencimiento ASC NULLS LAST, created_at ASC.
--   4. Lock: FOR UPDATE en lotes para prevenir condiciones de carrera.
--
-- Parámetros:
--   p_tenant_id       — tenant scope
--   p_insumo_id       — insumo a descontar
--   p_cantidad        — cantidad neta a descontar (sin aplicar merma; la merma se aplica ANTES de llamar)
--   p_idempotency_key — clave única por operación (ej. sha256(despacho_id + insumo_id))
--   p_tipo            — tipo_movimiento (default 'salida_receta')
--   p_referencia_id   — ID de la entidad que origina el descuento (despacho, tanda, etc.)
--   p_referencia_tipo — 'despacho' | 'tanda' | 'pedido' | 'merma'
--   p_usuario_id      — usuario que ejecuta la operación
--
-- Retorna: jsonb { ok, insumo_id, cantidad_descontada, lotes_afectados[], idempotency_key }
CREATE OR REPLACE FUNCTION public.fn_descontar_insumo_fefo(
  p_tenant_id       uuid,
  p_insumo_id       uuid,
  p_cantidad        numeric,
  p_idempotency_key text,
  p_tipo            text    DEFAULT 'salida_receta',
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
  v_restante       numeric := p_cantidad;
  v_lote           RECORD;
  v_descuento      numeric;
  v_operacion_id   uuid    := gen_random_uuid();
  v_lotes_afectados uuid[] := '{}';
  v_resultado      jsonb;
  v_existente      jsonb;
BEGIN
  -- Validación básica
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad a descontar debe ser positiva, recibido: %', p_cantidad
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Idempotency check ────────────────────────────────────────────────────────
  SELECT resultado INTO v_existente
  FROM public.operaciones_idempotentes
  WHERE clave = p_idempotency_key;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  -- ── Verificar stock disponible antes de bloquear ──────────────────────────
  IF (
    SELECT COALESCE(SUM(cantidad_actual), 0)
    FROM public.lotes
    WHERE tenant_id = p_tenant_id
      AND insumo_id = p_insumo_id
      AND activo = true
      AND deleted_at IS NULL
      AND cantidad_actual > 0
  ) < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para insumo %. Solicitado: %, Disponible: %',
      p_insumo_id,
      p_cantidad,
      (SELECT COALESCE(SUM(cantidad_actual), 0) FROM public.lotes
       WHERE tenant_id = p_tenant_id AND insumo_id = p_insumo_id
         AND activo = true AND deleted_at IS NULL)
    USING ERRCODE = 'P0001';
  END IF;

  -- ── FEFO: iterar lotes en orden, con lock ────────────────────────────────────
  FOR v_lote IN
    SELECT id, cantidad_actual
    FROM public.lotes
    WHERE tenant_id = p_tenant_id
      AND insumo_id = p_insumo_id
      AND activo = true
      AND deleted_at IS NULL
      AND cantidad_actual > 0
    ORDER BY
      fecha_vencimiento ASC NULLS LAST,
      created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;

    v_descuento := LEAST(v_lote.cantidad_actual, v_restante);

    UPDATE public.lotes
    SET
      cantidad_actual = cantidad_actual - v_descuento,
      updated_at = now()
    WHERE id = v_lote.id;

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
      p_tipo::public.tipo_movimiento,
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

  -- Doble check post-loop (no debería llegar aquí por el pre-check, pero por seguridad)
  IF v_restante > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente mid-transaction para insumo %', p_insumo_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Registrar idempotency ────────────────────────────────────────────────────
  v_resultado := jsonb_build_object(
    'ok',                 true,
    'insumo_id',          p_insumo_id,
    'cantidad_descontada', p_cantidad,
    'lotes_afectados',    to_jsonb(v_lotes_afectados),
    'operacion_id',       v_operacion_id,
    'idempotency_key',    p_idempotency_key
  );

  INSERT INTO public.operaciones_idempotentes (clave, resultado)
  VALUES (p_idempotency_key, v_resultado)
  ON CONFLICT (clave) DO NOTHING;

  -- En el raro caso de conflicto (carrera concurrente exacta), devolver el existente
  IF NOT FOUND THEN
    SELECT resultado INTO v_resultado
    FROM public.operaciones_idempotentes
    WHERE clave = p_idempotency_key;
  END IF;

  RETURN v_resultado;
END;
$$;

-- Revocar acceso público; solo via service_role (Server Actions con admin client)
REVOKE ALL ON FUNCTION public.fn_descontar_insumo_fefo FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_descontar_insumo_fefo TO service_role;


-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.fn_descontar_insumo_fefo;
-- DROP TABLE IF EXISTS public.operaciones_idempotentes;
-- =============================================================================
