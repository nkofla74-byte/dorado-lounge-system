-- ──────────────────────────────────────────────────────────────────────────────
-- 20260518000001_almacen_codigos_y_empaques
-- Almacén — códigos auto-generados para insumos y lotes + campos de empaque.
--
-- Cambios:
--   1. enum unidad_medida: agregar 'lb' (libra).
--   2. tabla tenant_codigo_counters: contadores por tenant + tipo (SKU, lote diario).
--   3. RPCs fn_siguiente_codigo_insumo, fn_siguiente_codigo_lote.
--   4. lotes: columnas codigo, cantidad_empaques, peso_unitario, unidad_peso.
--   5. UNIQUE (tenant_id, codigo) en lotes.
--   6. Backfill de códigos para registros existentes + NOT NULL.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Unidad nueva
ALTER TYPE public.unidad_medida ADD VALUE IF NOT EXISTS 'lb';

-- 2. Contadores por tenant
CREATE TABLE IF NOT EXISTS public.tenant_codigo_counters (
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id),
  tipo        text        NOT NULL,
  contador    integer     NOT NULL DEFAULT 0 CHECK (contador >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tipo)
);

ALTER TABLE public.tenant_codigo_counters ENABLE ROW LEVEL SECURITY;

-- Solo service-role escribe vía RPC (SECURITY DEFINER) — sin policy = denegado para authenticated.

COMMENT ON TABLE public.tenant_codigo_counters IS
  'Contadores atómicos por tenant para auto-generación de códigos. tipo: "insumo" o "lote_YYYYMMDD".';

-- 3. RPC: siguiente código de insumo (SKU)
CREATE OR REPLACE FUNCTION public.fn_siguiente_codigo_insumo(p_tenant uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contador int;
BEGIN
  INSERT INTO public.tenant_codigo_counters (tenant_id, tipo, contador)
  VALUES (p_tenant, 'insumo', 1)
  ON CONFLICT (tenant_id, tipo)
  DO UPDATE SET contador = tenant_codigo_counters.contador + 1, updated_at = now()
  RETURNING contador INTO v_contador;

  RETURN 'INS-' || lpad(v_contador::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_siguiente_codigo_insumo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_siguiente_codigo_insumo(uuid) TO authenticated;

-- 4. RPC: siguiente código de lote
CREATE OR REPLACE FUNCTION public.fn_siguiente_codigo_lote(p_tenant uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo     text;
  v_contador int;
  v_fecha    text;
BEGIN
  v_fecha := to_char(CURRENT_DATE, 'YYYYMMDD');
  v_tipo  := 'lote_' || v_fecha;

  INSERT INTO public.tenant_codigo_counters (tenant_id, tipo, contador)
  VALUES (p_tenant, v_tipo, 1)
  ON CONFLICT (tenant_id, tipo)
  DO UPDATE SET contador = tenant_codigo_counters.contador + 1, updated_at = now()
  RETURNING contador INTO v_contador;

  RETURN 'LT-' || v_fecha || '-' || lpad(v_contador::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_siguiente_codigo_lote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_siguiente_codigo_lote(uuid) TO authenticated;

-- 5. lotes — columnas nuevas
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS codigo            text,
  ADD COLUMN IF NOT EXISTS cantidad_empaques integer       CHECK (cantidad_empaques IS NULL OR cantidad_empaques > 0),
  ADD COLUMN IF NOT EXISTS peso_unitario     numeric(12,4) CHECK (peso_unitario IS NULL OR peso_unitario > 0),
  ADD COLUMN IF NOT EXISTS unidad_peso       public.unidad_medida;

-- 6. UNIQUE codigo de lote por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_lotes_tenant_codigo
  ON public.lotes (tenant_id, codigo)
  WHERE codigo IS NOT NULL;

-- 7. Backfill de códigos existentes (sólo si todavía no hay)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.insumos WHERE codigo IS NULL LOOP
    UPDATE public.insumos
      SET codigo = public.fn_siguiente_codigo_insumo(r.tenant_id)
      WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id, tenant_id FROM public.lotes WHERE codigo IS NULL LOOP
    UPDATE public.lotes
      SET codigo = public.fn_siguiente_codigo_lote(r.tenant_id)
      WHERE id = r.id;
  END LOOP;
END;
$$;

-- 8. Hacer codigo NOT NULL una vez backfilled
ALTER TABLE public.insumos ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE public.lotes   ALTER COLUMN codigo SET NOT NULL;
