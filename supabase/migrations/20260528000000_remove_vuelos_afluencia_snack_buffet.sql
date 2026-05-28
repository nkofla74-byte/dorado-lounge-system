-- =============================================================================
-- Eliminación de módulos: vuelos, afluencia (recepción), snack, buffet.
-- Migración forward destructiva — el historial previo se conserva intacto.
--
-- Decisiones (ver conversación de remoción):
--   • Enums user_role / zona_servicio: se dejan INERTES (Postgres no permite
--     DROP VALUE sin recrear el tipo). recepcion/personal_snack/personal_buffet
--     quedan como valores muertos sin uso en la app.
--   • Tablas de evento se dropean (datos irrecuperables).
-- =============================================================================

BEGIN;

-- ── 1. Vistas seguras por tenant que dependen de las MV a eliminar ───────────
DROP VIEW IF EXISTS public.v_cogs_per_passenger_tenant;
DROP VIEW IF EXISTS public.v_ocupacion_diaria_tenant;

-- ── 2. Materialized views dependientes de afluencia_ingresos / vuelos_snapshots
DROP MATERIALIZED VIEW IF EXISTS public.mv_cogs_per_passenger;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ocupacion_diaria;

-- ── 3. Funciones de refresh de ocupación (ya sin MV destino) ─────────────────
DROP FUNCTION IF EXISTS public.refresh_ocupacion_diaria();
DROP FUNCTION IF EXISTS public.refresh_ocupacion_diaria_initial();

-- ── 4. refresh_analytics_views: dejar solo consumo (cogs eliminado) ──────────
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_consumo_vs_produccion_turno;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_analytics_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_views() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_views() TO service_role;

-- ── 5. Tablas de los módulos eliminados ──────────────────────────────────────
DROP TABLE IF EXISTS public.pasajeros_ingreso;
DROP TABLE IF EXISTS public.afluencia_ingresos;
DROP TABLE IF EXISTS public.vuelos_snapshots;
DROP TABLE IF EXISTS public.aircraft_capacity;
DROP TABLE IF EXISTS public.buffet_tickets_turno;

COMMIT;
