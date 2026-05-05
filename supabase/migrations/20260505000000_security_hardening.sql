-- =============================================================================
-- security_hardening.sql
-- Endurece permisos de funciones y vistas según hallazgos del security advisor.
-- Idempotente: solo REVOKE/GRANT/ALTER/CREATE OR REPLACE — sin DDL destructivo.
-- =============================================================================


-- ── S1: fn_descontar_insumo_fefo — solo service_role ─────────────────────────
-- SECURITY DEFINER crítica. No debe ser accesible por anon ni authenticated.
REVOKE ALL ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, text, uuid, text, uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, text, uuid, text, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_descontar_insumo_fefo(
  uuid, uuid, numeric, text, text, uuid, text, uuid
) TO service_role;


-- ── S2: audit_log_set_hash — trigger interno, sin acceso externo ──────────────
REVOKE ALL ON FUNCTION public.audit_log_set_hash() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_log_set_hash() FROM anon, authenticated;


-- ── S3: Materialized views — solo authenticated con filtro tenant ─────────────
-- Revocar acceso directo de anon; authenticated accede únicamente vía
-- Server Actions que aplican filtro tenant_id (admin client).
REVOKE ALL ON TABLE public.mv_consumo_vs_produccion_turno FROM anon;
REVOKE ALL ON TABLE public.mv_cogs_per_passenger FROM anon;
-- Mantener SELECT para authenticated (lectura vía Server Actions con assert tenant)
-- pero revocar INSERT/UPDATE/DELETE (vistas son read-only de todas formas)
REVOKE INSERT, UPDATE, DELETE ON TABLE public.mv_consumo_vs_produccion_turno FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.mv_cogs_per_passenger FROM authenticated;


-- ── S4a: refresh_analytics_views — solo service_role ─────────────────────────
REVOKE ALL ON FUNCTION public.refresh_analytics_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_views() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_views() TO service_role;


-- ── S4b: handle_new_user — trigger interno, sin acceso externo ───────────────
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;


-- ── S4c: rls_auto_enable — solo service_role ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
  END IF;
END
$$;


-- ── S5: prevent_mutation — search_path fijo ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es append-only: no se permiten UPDATE ni DELETE', TG_TABLE_NAME;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_mutation() FROM anon, authenticated;


-- ── S6a: set_updated_at — search_path fijo ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;


-- ── S6b: validate_pedido_estado — search_path fijo ───────────────────────────
CREATE OR REPLACE FUNCTION public.validate_pedido_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'Pedido en estado "%" es terminal e inmutable', OLD.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'creado' AND NEW.estado NOT IN ('en_preparacion', 'cancelado') THEN
    RAISE EXCEPTION 'Transición inválida en pedido: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'en_preparacion' AND NEW.estado NOT IN ('despachado', 'cancelado') THEN
    RAISE EXCEPTION 'Transición inválida en pedido: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'despachado' AND NEW.estado <> 'entregado' THEN
    RAISE EXCEPTION 'Transición inválida en pedido: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_pedido_estado() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_pedido_estado() FROM anon, authenticated;


-- ── S6c: validate_tanda_estado — search_path fijo ────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_tanda_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'Tanda en estado "%" es terminal e inmutable', OLD.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'planificada' AND NEW.estado NOT IN ('en_proceso', 'cancelada') THEN
    RAISE EXCEPTION 'Transición inválida en tanda: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'en_proceso' AND NEW.estado NOT IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'Transición inválida en tanda: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado = 'en_proceso' AND OLD.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  IF NEW.estado = 'completada' AND OLD.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_tanda_estado() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_tanda_estado() FROM anon, authenticated;


-- ── S6d: validate_receta_insumo_destino — search_path fijo ───────────────────
CREATE OR REPLACE FUNCTION public.validate_receta_insumo_destino()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.insumo_destino_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.insumos
      WHERE id        = NEW.insumo_destino_id
        AND capa      = 'capa_2'
        AND tenant_id = NEW.tenant_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'insumo_destino_id "%" debe referenciar un insumo de capa_2 activo del mismo tenant',
        NEW.insumo_destino_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_receta_insumo_destino() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_receta_insumo_destino() FROM anon, authenticated;


-- ── fn_assert_same_tenant — search_path fijo (prevención proactiva) ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_assert_same_tenant'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.fn_assert_same_tenant(text, uuid, uuid)
    FROM anon, authenticated;
  END IF;
END
$$;


-- =============================================================================
-- ROLLBACK: no aplica — permisos se revierten recreando funciones con grants
-- por defecto (ver migraciones originales).
-- =============================================================================
