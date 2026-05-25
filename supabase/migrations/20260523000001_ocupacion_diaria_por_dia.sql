-- ──────────────────────────────────────────────────────────────────────────────
-- 20260523000001_ocupacion_diaria_por_dia
-- Refactor de mv_ocupacion_diaria: 1 fila por (tenant_id, fecha) en lugar de 2.
--
-- Razón: la afluencia es un total único por día (no se particiona por dirección).
-- Calcular ocupación dividiendo el total de pasajeros entre la capacidad de UNA
-- dirección produce % > 100% irreales. La nueva vista suma capacidad de salidas
-- + llegadas como denominador, y expone los conteos por dirección como columnas.
-- ──────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_ocupacion_diaria;

CREATE MATERIALIZED VIEW public.mv_ocupacion_diaria AS
WITH vuelos_dia AS (
  SELECT
    tenant_id,
    fecha,
    COUNT(*) FILTER (WHERE direccion = 'departure' AND status <> 'cancelled') AS departures_vuelos,
    COUNT(*) FILTER (WHERE direccion = 'arrival'   AND status <> 'cancelled') AS arrivals_vuelos,
    COUNT(*) FILTER (WHERE status = 'cancelled')                              AS vuelos_cancelados,
    COUNT(*) FILTER (WHERE capacidad_estimada IS NULL AND status <> 'cancelled') AS vuelos_sin_capacidad,
    COALESCE(SUM(capacidad_estimada) FILTER (WHERE direccion = 'departure' AND status <> 'cancelled'), 0) AS departures_capacidad,
    COALESCE(SUM(capacidad_estimada) FILTER (WHERE direccion = 'arrival'   AND status <> 'cancelled'), 0) AS arrivals_capacidad,
    COALESCE(SUM(capacidad_estimada) FILTER (WHERE status <> 'cancelled'), 0)                              AS capacidad_total
  FROM public.vuelos_snapshots
  GROUP BY tenant_id, fecha
),
afluencia_dia AS (
  SELECT
    tenant_id,
    (ingresado_at AT TIME ZONE 'America/Bogota')::date AS fecha,
    SUM(cantidad)                                       AS pasajeros_reales
  FROM public.afluencia_ingresos
  GROUP BY tenant_id, (ingresado_at AT TIME ZONE 'America/Bogota')::date
)
SELECT
  vd.tenant_id,
  vd.fecha,
  vd.departures_vuelos,
  vd.arrivals_vuelos,
  vd.vuelos_cancelados,
  vd.vuelos_sin_capacidad,
  vd.departures_capacidad,
  vd.arrivals_capacidad,
  vd.capacidad_total                                          AS capacidad_estimada,
  COALESCE(ad.pasajeros_reales, 0)                            AS pasajeros_reales,
  CASE
    WHEN vd.capacidad_total = 0 THEN NULL
    ELSE ROUND((COALESCE(ad.pasajeros_reales, 0)::numeric / vd.capacidad_total) * 100, 2)
  END                                                         AS ocupacion_pct
FROM vuelos_dia vd
LEFT JOIN afluencia_dia ad
  ON  ad.tenant_id = vd.tenant_id
  AND ad.fecha     = vd.fecha
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_ocupacion_diaria_pk
  ON public.mv_ocupacion_diaria (tenant_id, fecha);

COMMENT ON MATERIALIZED VIEW public.mv_ocupacion_diaria IS
  'Ocupación diaria (1 fila por tenant/fecha). Capacidad denominador = salidas + llegadas. Refrescar via refresh_ocupacion_diaria().';

-- ROLLBACK:
-- DROP MATERIALIZED VIEW IF EXISTS public.mv_ocupacion_diaria;
-- (no se reaplica el esquema anterior porque era estrictamente inferior)
