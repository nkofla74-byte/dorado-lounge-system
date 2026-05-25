-- ──────────────────────────────────────────────────────────────────────────────
-- 20260523000000_vuelos_snapshots
-- Persistencia de vuelos para estadísticas históricas de la sala VIP.
--
-- AviationStack solo entrega datos "vivos" (plan free no permite filter por
-- fecha histórica). Construimos histórico hacia adelante con snapshots diarios:
-- un cron al final del día captura todos los vuelos de BOG (salidas y llegadas)
-- y los persiste con UPSERT por (tenant_id, fecha, numero, direccion).
--
-- Cruza con aircraft_capacity para estimar pasajeros esperados, y con
-- afluencia_ingresos para calcular ocupación real vs. esperada.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Tabla append-only de snapshots de vuelos.
CREATE TABLE IF NOT EXISTS public.vuelos_snapshots (
  tenant_id          uuid         NOT NULL REFERENCES public.tenants(id),
  fecha              date         NOT NULL,
  numero             text         NOT NULL,
  direccion          text         NOT NULL CHECK (direccion IN ('departure', 'arrival')),
  aerolinea          text,
  aircraft_iata      text,
  origen             text,
  destino            text,
  scheduled_at       timestamptz  NOT NULL,
  estimated_at       timestamptz,
  actual_at          timestamptz,
  status             text         NOT NULL,
  gate               text,
  terminal           text,
  capacidad_estimada integer      CHECK (capacidad_estimada IS NULL OR capacidad_estimada > 0),
  captured_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fecha, numero, direccion)
);

CREATE INDEX IF NOT EXISTS idx_vuelos_snapshots_tenant_fecha
  ON public.vuelos_snapshots (tenant_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_vuelos_snapshots_aircraft
  ON public.vuelos_snapshots (aircraft_iata)
  WHERE aircraft_iata IS NOT NULL;

-- 2. RLS: solo lectura para el tenant. Escritura vía service_role (cron).
ALTER TABLE public.vuelos_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vuelos_snapshots_select_tenant" ON public.vuelos_snapshots;
CREATE POLICY "vuelos_snapshots_select_tenant" ON public.vuelos_snapshots
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

COMMENT ON TABLE public.vuelos_snapshots IS
  'Snapshots diarios de vuelos de El Dorado (BOG) capturados desde AviationStack. PK natural (tenant, fecha, numero, dirección); UPSERT al refrescar estado del mismo vuelo en el día.';

-- 3. Vista materializada de ocupación diaria.
--    Agrega vuelos del día y los cruza con pasajeros reales de afluencia.
--    ocupacion_pct = pasajeros_reales / capacidad_total_esperada × 100.
DROP MATERIALIZED VIEW IF EXISTS public.mv_ocupacion_diaria;

CREATE MATERIALIZED VIEW public.mv_ocupacion_diaria AS
WITH vuelos_dia AS (
  SELECT
    v.tenant_id,
    v.fecha,
    v.direccion,
    COUNT(*)                                            AS total_vuelos,
    COUNT(*) FILTER (WHERE v.status = 'cancelled')      AS vuelos_cancelados,
    COALESCE(SUM(v.capacidad_estimada), 0)              AS capacidad_total,
    COUNT(*) FILTER (WHERE v.capacidad_estimada IS NULL) AS vuelos_sin_capacidad
  FROM public.vuelos_snapshots v
  WHERE v.status <> 'cancelled'
  GROUP BY v.tenant_id, v.fecha, v.direccion
),
afluencia_dia AS (
  SELECT
    ai.tenant_id,
    (ai.ingresado_at AT TIME ZONE 'America/Bogota')::date AS fecha,
    SUM(ai.cantidad)                                       AS pasajeros_reales
  FROM public.afluencia_ingresos ai
  GROUP BY ai.tenant_id, (ai.ingresado_at AT TIME ZONE 'America/Bogota')::date
)
SELECT
  vd.tenant_id,
  vd.fecha,
  vd.direccion,
  vd.total_vuelos,
  vd.vuelos_cancelados,
  vd.vuelos_sin_capacidad,
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
  ON public.mv_ocupacion_diaria (tenant_id, fecha, direccion);

-- 4. Helper: refrescar la vista (CONCURRENTLY requiere índice único, ya creado).
CREATE OR REPLACE FUNCTION public.refresh_ocupacion_diaria()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_ocupacion_diaria;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_ocupacion_diaria FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_ocupacion_diaria TO service_role;

COMMENT ON MATERIALIZED VIEW public.mv_ocupacion_diaria IS
  'Ocupación diaria: vuelos × capacidad esperada × pasajeros reales por dirección. Refrescar tras cada snapshot diario via refresh_ocupacion_diaria().';

-- ──────────────────────────────────────────────────────────────────────────────
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.refresh_ocupacion_diaria();
-- DROP MATERIALIZED VIEW IF EXISTS public.mv_ocupacion_diaria;
-- DROP TABLE IF EXISTS public.vuelos_snapshots;
-- ──────────────────────────────────────────────────────────────────────────────
