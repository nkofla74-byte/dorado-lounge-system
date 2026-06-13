-- =============================================================================
-- 20260612120000_requisiciones.sql
-- Frente 2 — Requisiciones cocina → almacén (coordinación / trazabilidad).
-- NO mueve inventario: el stock solo se descuenta vía receta (Principio Rector).
-- Spec: docs/superpowers/specs/2026-06-11-cierre-operacional-design.md §Frente 2.
-- Idempotente. Sin DROP de columnas ni tablas.
-- =============================================================================

-- ── Enum de estado ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.estado_requisicion AS ENUM (
    'solicitada', 'en_alistamiento', 'despachada', 'recibida', 'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabla: requisiciones ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisiciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  area_solicitante public.area_produccion NOT NULL,
  solicitada_por   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  turno_id         uuid REFERENCES public.turnos(id) ON DELETE SET NULL,
  estado           public.estado_requisicion NOT NULL DEFAULT 'solicitada',
  notas            text,
  version          integer NOT NULL DEFAULT 1,
  idempotency_key  text NOT NULL,
  solicitada_at    timestamptz NOT NULL DEFAULT now(),
  alistamiento_at  timestamptz,
  despachada_at    timestamptz,
  recibida_at      timestamptz,
  cancelada_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT chk_requisicion_area_solicitante
    CHECK (area_solicitante IN ('cocina_caliente', 'cocina_fria', 'amex', 'pasteleria'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_requisiciones_idempotency
  ON public.requisiciones (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_requisiciones_cola_almacen
  ON public.requisiciones (tenant_id, estado, solicitada_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requisiciones_area
  ON public.requisiciones (tenant_id, area_solicitante, solicitada_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requisiciones_turno
  ON public.requisiciones (tenant_id, turno_id)
  WHERE turno_id IS NOT NULL;

-- ── Tabla: requisicion_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisicion_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  requisicion_id      uuid NOT NULL REFERENCES public.requisiciones(id) ON DELETE CASCADE,
  insumo_id           uuid NOT NULL REFERENCES public.insumos(id),
  cantidad_solicitada numeric(12,4) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_despachada numeric(12,4) NOT NULL DEFAULT 0 CHECK (cantidad_despachada >= 0),
  unidad              public.unidad_medida NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisicion_items_requisicion
  ON public.requisicion_items (tenant_id, requisicion_id);

-- ── Tabla: requisicion_eventos (append-only) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisicion_eventos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  requisicion_id uuid NOT NULL REFERENCES public.requisiciones(id) ON DELETE CASCADE,
  estado         public.estado_requisicion NOT NULL,
  actor_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisicion_eventos_requisicion
  ON public.requisicion_eventos (requisicion_id, created_at);

-- Append-only: reusa la función genérica public.prevent_mutation() (migración 0002).
DROP TRIGGER IF EXISTS requisicion_eventos_no_update ON public.requisicion_eventos;
CREATE TRIGGER requisicion_eventos_no_update
  BEFORE UPDATE ON public.requisicion_eventos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

DROP TRIGGER IF EXISTS requisicion_eventos_no_delete ON public.requisicion_eventos;
CREATE TRIGGER requisicion_eventos_no_delete
  BEFORE DELETE ON public.requisicion_eventos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.requisiciones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicion_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicion_eventos ENABLE ROW LEVEL SECURITY;

-- requisiciones
DROP POLICY IF EXISTS "requisiciones_tenant_select" ON public.requisiciones;
CREATE POLICY "requisiciones_tenant_select" ON public.requisiciones
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "requisiciones_tenant_modify" ON public.requisiciones;
CREATE POLICY "requisiciones_tenant_modify" ON public.requisiciones
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente',
      'sous_chef', 'personal_pasteleria', 'personal_almacen'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- requisicion_items
DROP POLICY IF EXISTS "requisicion_items_tenant_select" ON public.requisicion_items;
CREATE POLICY "requisicion_items_tenant_select" ON public.requisicion_items
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "requisicion_items_tenant_modify" ON public.requisicion_items;
CREATE POLICY "requisicion_items_tenant_modify" ON public.requisicion_items
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente',
      'sous_chef', 'personal_pasteleria', 'personal_almacen'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- requisicion_eventos (INSERT acotado por tenant; UPDATE/DELETE bloqueados por trigger)
DROP POLICY IF EXISTS "requisicion_eventos_tenant_select" ON public.requisicion_eventos;
CREATE POLICY "requisicion_eventos_tenant_select" ON public.requisicion_eventos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "requisicion_eventos_tenant_insert" ON public.requisicion_eventos;
CREATE POLICY "requisicion_eventos_tenant_insert" ON public.requisicion_eventos
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

COMMENT ON TABLE public.requisiciones IS
  'Requisiciones cocina→almacén. Coordinación pura: no mueve inventario (Principio Rector).';
