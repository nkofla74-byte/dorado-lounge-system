-- Añade campos demográficos a pasajeros_ingreso para lectura automática
-- desde pase de abordaje (BCBP), pasaporte (MRZ) o cédula colombiana (PDF417).
-- Todos opcionales: pueden quedar NULL si el documento no los provee.

ALTER TABLE public.pasajeros_ingreso
  ADD COLUMN IF NOT EXISTS sexo             text
    CHECK (sexo IN ('M', 'F', 'X')),
  ADD COLUMN IF NOT EXISTS fecha_nacimiento  date,
  ADD COLUMN IF NOT EXISTS pais_origen       text;   -- código ICAO 3 letras (COL, USA, etc.)

COMMENT ON COLUMN public.pasajeros_ingreso.sexo
  IS 'M/F/X según documento escaneado';
COMMENT ON COLUMN public.pasajeros_ingreso.fecha_nacimiento
  IS 'Fecha de nacimiento extraída del documento';
COMMENT ON COLUMN public.pasajeros_ingreso.pais_origen
  IS 'Código ICAO-3 del país de la nacionalidad (MRZ) o COL para cédulas';

CREATE INDEX IF NOT EXISTS idx_pasajeros_ingreso_pais
  ON public.pasajeros_ingreso(tenant_id, pais_origen) WHERE deleted_at IS NULL;
