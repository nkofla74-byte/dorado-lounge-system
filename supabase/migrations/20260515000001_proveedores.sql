-- ──────────────────────────────────────────────────────────────────────────────
-- Sprint C: Módulo Proveedores
-- Crea tabla proveedores y añade proveedor_id FK a lotes.
-- La columna lotes.proveedor (text) se mantiene para retrocompatibilidad.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.proveedores (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid          NOT NULL REFERENCES public.tenants(id),
  nombre      text          NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 255),
  contacto    text,
  telefono    text,
  email       text,
  notas       text,
  activo      boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant
  ON public.proveedores(tenant_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proveedores_select_tenant" ON public.proveedores;
CREATE POLICY "proveedores_select_tenant" ON public.proveedores
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "proveedores_modify_admin" ON public.proveedores;
CREATE POLICY "proveedores_modify_admin" ON public.proveedores
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'superuser')
  )
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'superuser')
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_proveedores ON public.proveedores;
CREATE TRIGGER set_updated_at_proveedores
  BEFORE UPDATE ON public.proveedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Vincular lotes con proveedores ────────────────────────────────────────────
-- Se mantiene lotes.proveedor (text) para compatibilidad con registros históricos.
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES public.proveedores(id);

CREATE INDEX IF NOT EXISTS idx_lotes_proveedor
  ON public.lotes(proveedor_id)
  WHERE proveedor_id IS NOT NULL AND deleted_at IS NULL;
