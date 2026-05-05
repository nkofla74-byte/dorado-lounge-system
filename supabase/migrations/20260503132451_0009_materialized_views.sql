-- =============================================================================
-- 0009_materialized_views.sql
-- Vistas materializadas para analytics (solo lectura, CQRS light).
-- Se refrescan periódicamente (cron job o al cerrar turno).
-- Idempotente.
-- =============================================================================

-- ── Vista: mv_consumo_vs_produccion_turno ─────────────────────────────────────
-- Compara consumo real contra producción por turno e insumo.
-- Base para el KPI operativo del chef y admin.
DROP MATERIALIZED VIEW IF EXISTS public.mv_consumo_vs_produccion_turno;

CREATE MATERIALIZED VIEW public.mv_consumo_vs_produccion_turno AS
SELECT
  t.tenant_id,
  t.id                                                        AS turno_id,
  t.nombre                                                    AS turno_nombre,
  t.iniciado_at,
  t.cerrado_at,
  i.id                                                        AS insumo_id,
  i.nombre                                                    AS insumo_nombre,
  i.capa,
  i.unidad_medida,
  COALESCE(SUM(CASE WHEN m.tipo = 'entrada'
    THEN m.cantidad ELSE 0 END), 0)                           AS total_entradas,
  COALESCE(SUM(CASE WHEN m.tipo = 'salida_receta'
    THEN ABS(m.cantidad) ELSE 0 END), 0)                      AS total_consumo,
  COALESCE(SUM(CASE WHEN m.tipo = 'merma'
    THEN ABS(m.cantidad) ELSE 0 END), 0)                      AS total_merma,
  COALESCE(SUM(CASE WHEN m.tipo = 'ajuste'
    THEN m.cantidad ELSE 0 END), 0)                           AS total_ajustes
FROM public.turnos t
JOIN public.movimientos_inventario m
  ON  m.tenant_id = t.tenant_id
  AND m.turno_id  = t.id
JOIN public.insumos i
  ON i.id = m.insumo_id
GROUP BY t.tenant_id, t.id, t.nombre, t.iniciado_at, t.cerrado_at,
         i.id, i.nombre, i.capa, i.unidad_medida
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_consumo_turno_pk
  ON public.mv_consumo_vs_produccion_turno (turno_id, insumo_id);

CREATE INDEX IF NOT EXISTS mv_consumo_turno_tenant
  ON public.mv_consumo_vs_produccion_turno (tenant_id);


-- ── Vista: mv_cogs_per_passenger ──────────────────────────────────────────────
-- Costo de ventas por pasajero por turno (eficiencia operativa real).
-- cogs_per_passenger = (consumo aplicado + merma operativa) / pasajeros
-- Separado de cash_outflow_per_passenger (ver ARCHITECTURE.md §9.6).
DROP MATERIALIZED VIEW IF EXISTS public.mv_cogs_per_passenger;

CREATE MATERIALIZED VIEW public.mv_cogs_per_passenger AS
SELECT
  t.tenant_id,
  t.id                                                                AS turno_id,
  t.nombre                                                            AS turno_nombre,
  t.iniciado_at,
  t.cerrado_at,
  COALESCE(SUM(ai.cantidad), 0)                                       AS total_pasajeros,
  COALESCE(SUM(
    CASE WHEN m.tipo IN ('salida_receta', 'merma')
    THEN ABS(m.cantidad) * COALESCE(l.costo_unitario, 0)
    ELSE 0 END
  ), 0)                                                               AS cogs_total_cop,
  CASE
    WHEN COALESCE(SUM(ai.cantidad), 0) = 0 THEN NULL
    ELSE ROUND(
      COALESCE(SUM(
        CASE WHEN m.tipo IN ('salida_receta', 'merma')
        THEN ABS(m.cantidad) * COALESCE(l.costo_unitario, 0)
        ELSE 0 END
      ), 0) / SUM(ai.cantidad),
      2
    )
  END                                                                 AS cogs_per_passenger
FROM public.turnos t
LEFT JOIN public.movimientos_inventario m
  ON  m.tenant_id = t.tenant_id
  AND m.turno_id  = t.id
LEFT JOIN public.lotes l
  ON l.id = m.lote_id
LEFT JOIN public.afluencia_ingresos ai
  ON  ai.tenant_id = t.tenant_id
  AND ai.turno_id  = t.id
GROUP BY t.tenant_id, t.id, t.nombre, t.iniciado_at, t.cerrado_at
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_cogs_passenger_pk
  ON public.mv_cogs_per_passenger (turno_id);

CREATE INDEX IF NOT EXISTS mv_cogs_passenger_tenant
  ON public.mv_cogs_per_passenger (tenant_id);


-- ── Función helper: refrescar todas las vistas de analytics ──────────────────
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_consumo_vs_produccion_turno;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cogs_per_passenger;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_analytics_views FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_views TO service_role;


-- =============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.refresh_analytics_views();
-- DROP MATERIALIZED VIEW IF EXISTS public.mv_cogs_per_passenger;
-- DROP MATERIALIZED VIEW IF EXISTS public.mv_consumo_vs_produccion_turno;
-- =============================================================================
