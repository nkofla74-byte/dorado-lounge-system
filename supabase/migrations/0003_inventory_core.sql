-- =============================================================================
-- 0003_inventory_core.sql
-- Inventario: insumos, lotes (FEFO), movimientos_inventario, mermas
-- Idempotente.
-- =============================================================================

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.capa_inventario AS ENUM ('capa_1', 'capa_2');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.unidad_medida AS ENUM ('kg', 'g', 'l', 'ml', 'unidad', 'porcion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tipo_movimiento AS ENUM (
    'entrada',        -- compra / recepción de proveedor
    'salida_receta',  -- descuento por ejecución de receta
    'merma',          -- pérdida categorizada
    'ajuste',         -- ajuste manual (superuser)
    'conteo'          -- resultado de conteo de cierre
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.categoria_merma AS ENUM (
    'operativa',    -- pérdida normal de proceso (recortes, cocción)
    'vencimiento',  -- producto vencido
    'accidente',    -- derrame, caída, daño físico
    'calidad',      -- rechazo por control de calidad
    'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Tabla: insumos ────────────────────────────────────────────────────────────
-- Catálogo de materias primas (capa_1) y productos internos (capa_2).
CREATE TABLE IF NOT EXISTS public.insumos (
  id              uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                   NOT NULL REFERENCES public.tenants(id),
  nombre          text                   NOT NULL,
  codigo          text,
  capa            public.capa_inventario NOT NULL DEFAULT 'capa_1',
  unidad_medida   public.unidad_medida   NOT NULL,
  stock_minimo    numeric(12,4)          NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  activo          boolean                NOT NULL DEFAULT true,
  created_at      timestamptz            NOT NULL DEFAULT now(),
  updated_at      timestamptz            NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT insumos_tenant_codigo_unique UNIQUE (tenant_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_insumos_tenant       ON public.insumos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_insumos_tenant_capa  ON public.insumos(tenant_id, capa);

ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insumos_select_tenant" ON public.insumos;
CREATE POLICY "insumos_select_tenant" ON public.insumos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "insumos_modify_admin" ON public.insumos;
CREATE POLICY "insumos_modify_admin" ON public.insumos
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin')
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: lotes ──────────────────────────────────────────────────────────────
-- Cada lote representa una recepción de insumo con su fecha de vencimiento.
-- Política de descuento: FEFO (First-Expired-First-Out) vía fn_descontar_insumo_fefo.
CREATE TABLE IF NOT EXISTS public.lotes (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid          NOT NULL REFERENCES public.tenants(id),
  insumo_id         uuid          NOT NULL REFERENCES public.insumos(id),
  cantidad_inicial  numeric(12,4) NOT NULL CHECK (cantidad_inicial > 0),
  cantidad_actual   numeric(12,4) NOT NULL CHECK (cantidad_actual >= 0),
  fecha_recibido    date          NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento date,         -- NULL = no vence (utensilios, algunos secos)
  proveedor         text,
  costo_unitario    numeric(14,2) CHECK (costo_unitario > 0),
  activo            boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT lotes_cantidad_check CHECK (cantidad_actual <= cantidad_inicial)
);

CREATE INDEX IF NOT EXISTS idx_lotes_tenant_insumo ON public.lotes(tenant_id, insumo_id);
CREATE INDEX IF NOT EXISTS idx_lotes_fefo ON public.lotes(tenant_id, insumo_id, fecha_vencimiento ASC NULLS LAST, created_at ASC)
  WHERE activo = true AND deleted_at IS NULL;

ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lotes_select_tenant" ON public.lotes;
CREATE POLICY "lotes_select_tenant" ON public.lotes
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "lotes_modify_admin" ON public.lotes;
CREATE POLICY "lotes_modify_admin" ON public.lotes
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin', 'chef', 'sous_chef')
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: movimientos_inventario ─────────────────────────────────────────────
-- Ledger de todos los movimientos. cantidad negativa = salida.
-- operacion_id agrupa todos los movimientos de una misma operación FEFO.
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
  id              uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                   NOT NULL REFERENCES public.tenants(id),
  insumo_id       uuid                   NOT NULL REFERENCES public.insumos(id),
  lote_id         uuid                   REFERENCES public.lotes(id),
  tipo            public.tipo_movimiento NOT NULL,
  cantidad        numeric(12,4)          NOT NULL,  -- negativo = salida, positivo = entrada
  operacion_id    uuid,                             -- groups rows from one FEFO call
  referencia_id   uuid,                             -- despacho_id, tanda_id, pedido_id, etc.
  referencia_tipo text,                             -- 'despacho' | 'tanda' | 'pedido' | 'merma'
  turno_id        uuid,                             -- FK added in 0006 after turnos exists
  idempotency_key text                   UNIQUE,    -- solo en la primera fila del grupo
  usuario_id      uuid                   REFERENCES public.users(id),
  created_at      timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_inv_tenant     ON public.movimientos_inventario(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mov_inv_insumo     ON public.movimientos_inventario(tenant_id, insumo_id);
CREATE INDEX IF NOT EXISTS idx_mov_inv_operacion  ON public.movimientos_inventario(operacion_id);
CREATE INDEX IF NOT EXISTS idx_mov_inv_created_at ON public.movimientos_inventario(created_at);

ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mov_inv_select_staff" ON public.movimientos_inventario;
CREATE POLICY "mov_inv_select_staff" ON public.movimientos_inventario
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: mermas ─────────────────────────────────────────────────────────────
-- Registro de pérdidas con causa categorizada. Siempre genera un movimiento_inventario.
CREATE TABLE IF NOT EXISTS public.mermas (
  id              uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                    NOT NULL REFERENCES public.tenants(id),
  insumo_id       uuid                    NOT NULL REFERENCES public.insumos(id),
  lote_id         uuid                    REFERENCES public.lotes(id),
  cantidad        numeric(12,4)           NOT NULL CHECK (cantidad > 0),
  categoria       public.categoria_merma  NOT NULL,
  descripcion     text,
  turno_id        uuid,                   -- FK added in 0006
  registrado_por  uuid                    REFERENCES public.users(id),
  idempotency_key text                    UNIQUE,
  created_at      timestamptz             NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mermas_tenant     ON public.mermas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mermas_insumo     ON public.mermas(tenant_id, insumo_id);
CREATE INDEX IF NOT EXISTS idx_mermas_created_at ON public.mermas(created_at);

ALTER TABLE public.mermas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mermas_select_staff" ON public.mermas;
CREATE POLICY "mermas_select_staff" ON public.mermas
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "mermas_insert_staff" ON public.mermas;
CREATE POLICY "mermas_insert_staff" ON public.mermas
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'personal_snack', 'personal_buffet'
    )
  );


-- =============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.mermas;
-- DROP TABLE IF EXISTS public.movimientos_inventario;
-- DROP TABLE IF EXISTS public.lotes;
-- DROP TABLE IF EXISTS public.insumos;
-- DROP TYPE IF EXISTS public.categoria_merma;
-- DROP TYPE IF EXISTS public.tipo_movimiento;
-- DROP TYPE IF EXISTS public.unidad_medida;
-- DROP TYPE IF EXISTS public.capa_inventario;
-- =============================================================================
