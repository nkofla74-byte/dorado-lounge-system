-- =============================================================================
-- Remoción definitiva: vuelos, afluencia (recepción / registro de pasajeros) y
-- el residuo del módulo chat. Forward idempotente — NO toca snack/buffet
-- (features vigentes). Decisión del dueño 2026-06-13.
-- Spec: docs/superpowers/specs/2026-06-13-remocion-vuelos-afluencia-recepcion-design.md
--
-- Nota: el enum user_role NO puede perder el valor 'recepcion' sin recrear el
-- tipo (riesgoso por users.role + RLS). Queda INERTE y documentado.
-- =============================================================================

BEGIN;

-- ── 1. Vistas seguras por tenant (dependen de las MV a eliminar) ─────────────
DROP VIEW IF EXISTS public.v_cogs_per_passenger_tenant;
DROP VIEW IF EXISTS public.v_ocupacion_diaria_tenant;
DROP VIEW IF EXISTS public.v_pasajeros_turno;

-- ── 2. Materialized views de afluencia / cogs por pasajero ───────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_cogs_per_passenger;
DROP MATERIALIZED VIEW IF EXISTS public.mv_ocupacion_diaria;

-- ── 3. Funciones de refresh de ocupación (ya sin MV destino) ─────────────────
DROP FUNCTION IF EXISTS public.refresh_ocupacion_diaria();
DROP FUNCTION IF EXISTS public.refresh_ocupacion_diaria_initial();

-- ── 4. refresh_analytics_views: dejar solo consumo ───────────────────────────
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

-- ── 5. Retención: las tablas objetivo (afluencia_ingresos, mensajes_chat)
-- desaparecen. Se elimina la vista de estado + ambas funciones de purga
-- (afluencia y chat) y se des-agenda cualquier job pg_cron asociado.
DROP VIEW IF EXISTS public.v_retencion_estado;
DROP FUNCTION IF EXISTS public.fn_purgar_afluencia_antigua();
DROP FUNCTION IF EXISTS public.fn_purgar_mensajes_chat_antiguos();

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job
           WHERE command ILIKE '%fn_purgar_afluencia_antigua%'
              OR command ILIKE '%fn_purgar_mensajes_chat_antiguos%'
              OR command ILIKE '%v_retencion_estado%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN NULL;
END $$;

-- ── 6. Tablas de los módulos eliminados ──────────────────────────────────────
DROP TABLE IF EXISTS public.pasajeros_ingreso;
DROP TABLE IF EXISTS public.afluencia_ingresos;
DROP TABLE IF EXISTS public.vuelos_snapshots;
DROP TABLE IF EXISTS public.aircraft_capacity;
DROP TABLE IF EXISTS public.buffet_tickets_turno;
DROP TABLE IF EXISTS public.mensajes_chat;

-- ── 7. Enum user_role: 'recepcion' inerte (no DROP VALUE) ────────────────────
COMMENT ON TYPE public.user_role IS
  'recepcion es un valor INERTE desde 2026-06-13 (remoción del rol recepción). No asignar.';

COMMIT;
