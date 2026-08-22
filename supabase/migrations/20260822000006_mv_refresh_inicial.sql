-- =============================================================================
-- 20260822000006_mv_refresh_inicial.sql
--
-- HALLAZGOS F-005 (HIGH) y F-020 (MEDIUM) — auditoría forense 2026-08-22.
--
-- F-005 — mv_consumo_vs_produccion_turno y mv_cogs_per_passenger se crearon
--   `WITH NO DATA` (0009) y refresh_analytics_views() solo hace REFRESH ...
--   CONCURRENTLY. PostgreSQL rechaza CONCURRENTLY sobre una vista jamás
--   poblada (SQLSTATE 55000: "CONCURRENTLY cannot be used when the materialized
--   view is not populated"), así que la RPC fallaba SIEMPRE. El problema ya se
--   había detectado y resuelto para mv_ocupacion_diaria con una migración
--   dedicada (20260525163000) que hace un primer refresh no concurrente; a
--   estas dos nunca se les aplicó.
--
-- F-020 — refresh_analytics_views es una reconstrucción completa de dos vistas
--   materializadas, es decir una escritura cara, y estaba protegida por el
--   permiso de LECTURA analytics:read, sin límite de frecuencia.
--
-- ESTE FIX:
--   1. Primer REFRESH no concurrente (idempotente: refrescar una vista ya
--      poblada es válido y simplemente la recalcula).
--   2. refresh_analytics_views pasa a ser tolerante: si la vista no está
--      poblada, cae a un refresh no concurrente en lugar de fallar.
--
-- El permiso analytics:refresh se añade a la matriz RBAC desde TypeScript.
-- =============================================================================

-- ── 1) Poblar por primera vez ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_consumo_vs_produccion_turno'
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_consumo_vs_produccion_turno;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_cogs_per_passenger'
  ) THEN
    REFRESH MATERIALIZED VIEW public.mv_cogs_per_passenger;
  END IF;
END $$;


-- ── 2) Refresco tolerante a vistas no pobladas ───────────────────────────────
-- CONCURRENTLY es lo deseable en producción (no bloquea las lecturas del panel),
-- pero exige que la vista ya tenga datos. La caída a refresh normal evita que un
-- despliegue nuevo deje la analítica muerta con un error opaco.
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vista text;
BEGIN
  FOREACH v_vista IN ARRAY ARRAY['mv_consumo_vs_produccion_turno', 'mv_cogs_per_passenger'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = v_vista
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', v_vista);
    EXCEPTION WHEN feature_not_supported THEN
      -- SQLSTATE 0A000: "CONCURRENTLY cannot be used when the materialized view
      -- is not populated". El primer refresco no puede ser concurrente.
      EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', v_vista);
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_analytics_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_views() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_views() TO service_role;

-- =============================================================================
-- ROLLBACK (manual): reaplicar refresh_analytics_views de 20260613000000 (solo
-- CONCURRENTLY). Las vistas quedarían pobladas igualmente, pero un entorno nuevo
-- volvería a fallar en el primer refresco.
-- =============================================================================
