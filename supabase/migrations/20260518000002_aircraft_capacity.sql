-- ──────────────────────────────────────────────────────────────────────────────
-- 20260518000002_aircraft_capacity
-- Tabla de capacidades por modelo de aeronave (open data, no por tenant).
-- Usada por el módulo `flights` para estimar afluencia a la sala VIP.
--
-- Carga seed con ~30 modelos que cubren el grueso del tráfico de El Dorado (BOG).
-- Fuente: especificaciones de fabricante + Wikipedia. Configuración 2-clase típica.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aircraft_capacity (
  iata_code  text         PRIMARY KEY,
  icao_code  text,
  nombre     text         NOT NULL,
  asientos   integer      NOT NULL CHECK (asientos > 0),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_capacity_icao
  ON public.aircraft_capacity (icao_code)
  WHERE icao_code IS NOT NULL;

-- Lectura pública (no es info sensible). No es tenant-scoped.
ALTER TABLE public.aircraft_capacity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aircraft_capacity_read_all" ON public.aircraft_capacity;
CREATE POLICY "aircraft_capacity_read_all" ON public.aircraft_capacity
  FOR SELECT TO authenticated
  USING (true);

-- Seed inicial: 30 tipos comunes en BOG. Upsert para idempotencia.
INSERT INTO public.aircraft_capacity (iata_code, icao_code, nombre, asientos) VALUES
  ('319', 'A319', 'Airbus A319',          134),
  ('320', 'A320', 'Airbus A320',          180),
  ('32N', 'A20N', 'Airbus A320neo',       180),
  ('321', 'A321', 'Airbus A321',          220),
  ('32Q', 'A21N', 'Airbus A321neo',       220),
  ('332', 'A332', 'Airbus A330-200',      247),
  ('333', 'A333', 'Airbus A330-300',      277),
  ('339', 'A339', 'Airbus A330-900neo',   287),
  ('351', 'A359', 'Airbus A350-900',      325),
  ('223', 'BCS3', 'Airbus A220-300',      145),
  ('733', 'B733', 'Boeing 737-300',       140),
  ('734', 'B734', 'Boeing 737-400',       147),
  ('737', 'B737', 'Boeing 737-700',       149),
  ('738', 'B738', 'Boeing 737-800',       189),
  ('739', 'B739', 'Boeing 737-900',       215),
  ('7M8', 'B38M', 'Boeing 737 MAX 8',     178),
  ('7M9', 'B39M', 'Boeing 737 MAX 9',     193),
  ('752', 'B752', 'Boeing 757-200',       200),
  ('763', 'B763', 'Boeing 767-300',       269),
  ('772', 'B772', 'Boeing 777-200',       312),
  ('77W', 'B77W', 'Boeing 777-300ER',     396),
  ('788', 'B788', 'Boeing 787-8',         242),
  ('789', 'B789', 'Boeing 787-9',         296),
  ('78X', 'B78X', 'Boeing 787-10',        330),
  ('E70', 'E170', 'Embraer E170',          78),
  ('E75', 'E75L', 'Embraer E175',          88),
  ('E90', 'E190', 'Embraer E190',         100),
  ('E95', 'E195', 'Embraer E195',         122),
  ('AT7', 'AT72', 'ATR 72',                72),
  ('AT5', 'AT45', 'ATR 42-500',            50),
  ('CR2', 'CRJ2', 'Bombardier CRJ 200',    50),
  ('CR9', 'CRJ9', 'Bombardier CRJ 900',    90),
  ('CRK', 'CRJX', 'Bombardier CRJ 1000',  104),
  ('DH4', 'DH8D', 'Dash 8 Q400',           78),
  ('C208', 'C208','Cessna 208 Caravan',     9),
  ('DH6', 'DHC6', 'DHC-6 Twin Otter',      19)
ON CONFLICT (iata_code) DO UPDATE
  SET icao_code = EXCLUDED.icao_code,
      nombre    = EXCLUDED.nombre,
      asientos  = EXCLUDED.asientos,
      updated_at = now();
