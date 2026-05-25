-- ──────────────────────────────────────────────────────────────────────────────
-- 20260523000002_turnos_por_usuario_y_autocierre
--
-- Cambio de modelo: 1 turno activo por (tenant, usuario) en vez de
-- 1 por tenant. Cada cuenta compartida (cocina, snack, recepcion, etc.)
-- puede tener varios turnos a lo largo del día, uno por empleado real
-- que entra a operar en un bloque (6a2 / 2a10 / 10a6).
--
-- Adicional: auto-cierre por pg_cron cada 15 min para turnos cuyo bloque
-- ya expiró (el empleado olvidó cerrar).
--
-- teamlider (text) cambia de semántica conceptualmente → "nombre del
-- empleado que abrió este turno". La columna SQL no se renombra para
-- no romper FKs ni queries de analytics; el cambio es solo en TS.
-- ──────────────────────────────────────────────────────────────────────────────

SET search_path = public;

-- 1. Nueva columna: motivo de cierre. NULL si el turno aún está abierto.
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS cierre_motivo text NULL;

ALTER TABLE public.turnos
  DROP CONSTRAINT IF EXISTS chk_turnos_cierre_motivo;
ALTER TABLE public.turnos
  ADD CONSTRAINT chk_turnos_cierre_motivo
  CHECK (cierre_motivo IS NULL OR cierre_motivo IN ('manual', 'auto_expiracion'));

COMMENT ON COLUMN public.turnos.cierre_motivo IS
  'Motivo del cierre: manual (botón Cerrar) o auto_expiracion (pg_cron al expirar el bloque). NULL si activo.';

-- 2. Backfill: turnos ya cerrados antes de esta migración → motivo "manual".
UPDATE public.turnos
SET cierre_motivo = 'manual'
WHERE cerrado_at IS NOT NULL AND cierre_motivo IS NULL;

-- 3. Índice por (tenant_id, responsable_id, activo) para query rápido del
--    turno activo de un usuario específico.
CREATE INDEX IF NOT EXISTS idx_turnos_tenant_user_activo
  ON public.turnos(tenant_id, responsable_id, activo)
  WHERE deleted_at IS NULL AND activo = true;

-- 4. Constraint: máximo 1 turno activo por (tenant, usuario) vivo.
--    Se aplica solo a filas activas y no soft-deleted.
DROP INDEX IF EXISTS uq_turnos_un_activo_por_user;
CREATE UNIQUE INDEX uq_turnos_un_activo_por_user
  ON public.turnos(tenant_id, responsable_id)
  WHERE activo = true AND deleted_at IS NULL AND responsable_id IS NOT NULL;

-- 5. Función: calcula el timestamp UTC en que termina un bloque dado
--    una hora de inicio (en Bogotá).
CREATE OR REPLACE FUNCTION public.fn_fin_bloque(
  p_bloque  public.turno_bloque,
  p_inicio  timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_fecha_local date;
  v_hora_local  int;
  v_fin_local   timestamp;  -- naive timestamp (interpretado en TZ Bogotá)
BEGIN
  v_fecha_local := (p_inicio AT TIME ZONE 'America/Bogota')::date;
  v_hora_local  := EXTRACT(HOUR FROM (p_inicio AT TIME ZONE 'America/Bogota'))::int;

  v_fin_local := CASE p_bloque
    WHEN '6a2'  THEN v_fecha_local::timestamp + interval '14 hours'
    WHEN '2a10' THEN v_fecha_local::timestamp + interval '22 hours'
    WHEN '10a6' THEN
      -- Si abrió entre 22:00 y 23:59 → cruza medianoche, fin al día siguiente 06:00.
      -- Si abrió entre 00:00 y 05:59 → fin hoy 06:00.
      CASE WHEN v_hora_local >= 22
           THEN (v_fecha_local + 1)::timestamp + interval '6 hours'
           ELSE v_fecha_local::timestamp + interval '6 hours'
      END
  END;

  RETURN v_fin_local AT TIME ZONE 'America/Bogota';
END $$;

COMMENT ON FUNCTION public.fn_fin_bloque IS
  'Devuelve el timestamptz UTC del fin del bloque dado el inicio del turno (TZ Bogotá).';

-- 6. Función: cierra turnos activos cuyo bloque ya expiró.
--    Se ejecuta vía pg_cron cada 15 min.
CREATE OR REPLACE FUNCTION public.cerrar_turnos_expirados()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH cerrados AS (
    UPDATE public.turnos t
       SET activo        = false,
           cerrado_at    = public.fn_fin_bloque(t.bloque, t.iniciado_at),
           cierre_motivo = 'auto_expiracion',
           updated_at    = now()
     WHERE t.activo = true
       AND t.deleted_at IS NULL
       AND t.bloque IS NOT NULL
       AND now() > public.fn_fin_bloque(t.bloque, t.iniciado_at)
    RETURNING t.id
  )
  SELECT COUNT(*) INTO v_count FROM cerrados;

  RETURN v_count;
END $$;

COMMENT ON FUNCTION public.cerrar_turnos_expirados IS
  'Cierra turnos activos cuyo bloque (6a2/2a10/10a6) ya expiró según hora Bogotá. Devuelve cantidad cerrada.';

-- 7. Agenda pg_cron cada 15 min (idempotente).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cerrar-turnos-expirados') THEN
    PERFORM cron.unschedule('cerrar-turnos-expirados');
  END IF;
END $$;

SELECT cron.schedule(
  'cerrar-turnos-expirados',
  '*/15 * * * *',
  $cron$ SELECT public.cerrar_turnos_expirados(); $cron$
);
