-- Registro individual de pasajeros al ingresar a la sala VIP.
-- Reemplaza el modelo de conteo bulk de afluencia_ingresos con datos
-- granulares por pasajero: datos de boarding pass + tipo de acceso.
-- Alimenta cogs_per_passenger y segmentación por tarjeta/aerolínea.

-- Tipo de acceso a la sala
DO $$ BEGIN
  CREATE TYPE public.tipo_acceso_sala AS ENUM (
    'amex',
    'priority_pass',
    'diners',
    'cortesia',
    'corporativo',
    'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pasajeros_ingreso (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid           NOT NULL REFERENCES public.tenants(id),
  turno_id          uuid           NOT NULL REFERENCES public.turnos(id),

  -- Datos del pasajero (boarding pass o manual)
  nombre_pasajero   text           NOT NULL,
  documento_tipo    text,                          -- CC, pasaporte, etc.
  documento_numero  text,

  -- Datos del vuelo
  vuelo_numero      text,
  aerolinea         text,
  destino           text,                          -- código IATA
  hora_vuelo        timestamptz,
  asiento           text,
  gate              text,

  -- Acceso a la sala
  tipo_acceso       public.tipo_acceso_sala NOT NULL DEFAULT 'otro',
  tarjeta_ultimos4  text,                          -- últimos 4 dígitos (opcional)
  acompanantes      integer        NOT NULL DEFAULT 0 CHECK (acompanantes >= 0),

  -- Zona
  zona              public.zona_servicio,          -- NULL = sala general

  -- Trazabilidad
  registrado_por    uuid           NOT NULL REFERENCES public.users(id),
  ingresado_at      timestamptz    NOT NULL DEFAULT now(),
  notas             text,

  -- Soft delete + timestamps
  deleted_at        timestamptz,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now()
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_pasajeros_ingreso_tenant
  ON public.pasajeros_ingreso(tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pasajeros_ingreso_turno
  ON public.pasajeros_ingreso(tenant_id, turno_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pasajeros_ingreso_tipo_acceso
  ON public.pasajeros_ingreso(tenant_id, tipo_acceso) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pasajeros_ingreso_fecha
  ON public.pasajeros_ingreso(tenant_id, ingresado_at) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE public.pasajeros_ingreso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pasajeros_select_tenant" ON public.pasajeros_ingreso;
CREATE POLICY "pasajeros_select_tenant" ON public.pasajeros_ingreso
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "pasajeros_insert_recepcion" ON public.pasajeros_ingreso;
CREATE POLICY "pasajeros_insert_recepcion" ON public.pasajeros_ingreso
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'recepcion'
    )
  );

DROP POLICY IF EXISTS "pasajeros_update_recepcion" ON public.pasajeros_ingreso;
CREATE POLICY "pasajeros_update_recepcion" ON public.pasajeros_ingreso
  FOR UPDATE TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'recepcion'
    )
  );
