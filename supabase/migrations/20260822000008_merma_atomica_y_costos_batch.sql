-- =============================================================================
-- 20260822000008_merma_atomica_y_costos_batch.sql
--
-- HALLAZGOS F-022 (MEDIUM, causa raíz RC-3) y F-021 (MEDIUM) — auditoría
-- forense 2026-08-22.
--
-- F-022 — registrarMerma descontaba el stock con fn_descontar_insumo_fefo y solo
--   después insertaba en `mermas`, en dos transacciones separadas. Si fallaba el
--   segundo paso el stock quedaba descontado sin registro de merma, y el propio
--   código lo admitía en su mensaje de error ("Stock deducido pero el registro de
--   merma falló. Contacta administración."). Eso descuadra `total_merma` en la
--   analítica de consumo.
--
-- F-021 — getCostosRecetas lanzaba una llamada RPC por receta con
--   Promise.allSettled: para el catálogo real de la sala son decenas de
--   round-trips simultáneos a Postgres desde una función serverless, con riesgo
--   de agotar el pool. El coste no era el cálculo, sino la ida y vuelta.
--
-- Idempotente: CREATE OR REPLACE / REVOKE / GRANT.
-- =============================================================================

-- ── F-022: merma en una sola transacción ─────────────────────────────────────
-- Deriva tenant y usuario de auth.jwt() y exige el permiso contra la matriz
-- RBAC, igual que las RPC de pedidos. La app deja de necesitar service_role aquí.
CREATE OR REPLACE FUNCTION public.fn_registrar_merma(
  p_insumo_id       uuid,
  p_cantidad        numeric,
  p_categoria       public.categoria_merma,
  p_descripcion     text,
  p_idempotency_key text,
  p_turno_id        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := public.fn_jwt_tenant();
  v_usuario uuid := public.fn_jwt_user();
BEGIN
  IF v_tenant IS NULL OR NOT public.fn_puede('inventory:merma') THEN
    RAISE EXCEPTION 'Sin permiso inventory:merma' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.insumos
    WHERE id = p_insumo_id AND tenant_id = v_tenant AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Insumo no encontrado' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Descuento y registro en la MISMA transacción: si el INSERT falla, el
  -- descuento se revierte con él.
  PERFORM public.fn_descontar_insumo_fefo(
    p_tenant_id       := v_tenant,
    p_insumo_id       := p_insumo_id,
    p_cantidad        := p_cantidad,
    p_idempotency_key := p_idempotency_key,
    p_tipo            := 'merma'::public.tipo_movimiento,
    p_referencia_tipo := 'merma',
    p_usuario_id      := v_usuario,
    p_turno_id        := p_turno_id
  );

  INSERT INTO public.mermas
    (tenant_id, insumo_id, cantidad, categoria, descripcion, registrado_por, idempotency_key)
  VALUES
    (v_tenant, p_insumo_id, p_cantidad, p_categoria, p_descripcion, v_usuario, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'insumo_id', p_insumo_id, 'cantidad', p_cantidad);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_registrar_merma(
  uuid, numeric, public.categoria_merma, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_registrar_merma(
  uuid, numeric, public.categoria_merma, text, text, uuid) TO authenticated, service_role;


-- ── F-021: costos por lote en un único round-trip ────────────────────────────
-- Reutiliza fn_costo_receta en lugar de reescribir la fórmula: el problema era
-- la ida y vuelta por receta, no el cálculo. Así sigue habiendo una sola
-- definición del costeo (y un solo guard de tenant).
CREATE OR REPLACE FUNCTION public.fn_costo_recetas(
  p_tenant_id  uuid,
  p_receta_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_id        uuid;
  v_resultado jsonb := '{}'::jsonb;
  v_costo     jsonb;
BEGIN
  IF p_receta_ids IS NULL OR array_length(p_receta_ids, 1) IS NULL THEN
    RETURN v_resultado;
  END IF;

  FOREACH v_id IN ARRAY p_receta_ids LOOP
    v_costo := public.fn_costo_receta(p_tenant_id, v_id);
    -- Las recetas sin costo calculable devuelven {"error": ...}: se omiten, que
    -- es lo que ya hacía el cliente al descartar los resultados con error.
    IF v_costo IS NOT NULL AND NOT (v_costo ? 'error') THEN
      v_resultado := v_resultado || jsonb_build_object(v_id::text, v_costo);
    END IF;
  END LOOP;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_costo_recetas(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_costo_recetas(uuid, uuid[]) TO authenticated, service_role;

-- =============================================================================
-- ROLLBACK (manual):
--   DROP FUNCTION IF EXISTS public.fn_costo_recetas(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.fn_registrar_merma(
--     uuid, numeric, public.categoria_merma, text, text, uuid);
--   Requiere revertir antes el módulo de inventario a la secuencia de dos pasos.
-- =============================================================================
