-- =============================================================================
-- 0005_production_orders.sql
-- Producción (tandas) + Despachos + Pedidos (máquina de estados con optimistic lock)
-- Idempotente.
-- =============================================================================

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.estado_tanda AS ENUM (
    'planificada', 'en_proceso', 'completada', 'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.estado_pedido AS ENUM (
    'creado', 'en_preparacion', 'despachado', 'entregado', 'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Tabla: tandas_produccion ──────────────────────────────────────────────────
-- Ejecución concreta de una receta de producción (batch de cocina).
-- turno_id: FK se agrega en 0006 cuando existe public.turnos.
CREATE TABLE IF NOT EXISTS public.tandas_produccion (
  id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                  NOT NULL REFERENCES public.tenants(id),
  receta_id       uuid                  NOT NULL REFERENCES public.recetas(id),
  turno_id        uuid,                 -- FK: ALTER TABLE en 0006
  cantidad_tandas integer               NOT NULL DEFAULT 1 CHECK (cantidad_tandas > 0),
  estado          public.estado_tanda   NOT NULL DEFAULT 'planificada',
  responsable_id  uuid                  REFERENCES public.users(id),
  notas           text,
  idempotency_key text                  UNIQUE,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz           NOT NULL DEFAULT now(),
  updated_at      timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tandas_tenant      ON public.tandas_produccion(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tandas_receta      ON public.tandas_produccion(receta_id);
CREATE INDEX IF NOT EXISTS idx_tandas_created_at  ON public.tandas_produccion(created_at);

ALTER TABLE public.tandas_produccion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tandas_select_staff" ON public.tandas_produccion;
CREATE POLICY "tandas_select_staff" ON public.tandas_produccion
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "tandas_modify_cocina" ON public.tandas_produccion;
CREATE POLICY "tandas_modify_cocina" ON public.tandas_produccion
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin', 'chef', 'sous_chef')
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: pedidos ────────────────────────────────────────────────────────────
-- Pedidos de la zona Amex (mesero). Máquina de estados con optimistic locking via `version`.
-- Transición válida: creado → en_preparacion → despachado → entregado
-- turno_id: FK en 0006.
CREATE TABLE IF NOT EXISTS public.pedidos (
  id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                  NOT NULL REFERENCES public.tenants(id),
  turno_id        uuid,                 -- FK: ALTER TABLE en 0006
  numero_mesa     text,
  responsable_id  uuid                  REFERENCES public.users(id),
  estado          public.estado_pedido  NOT NULL DEFAULT 'creado',
  version         integer               NOT NULL DEFAULT 1,
  zona            public.zona_servicio  NOT NULL,
  notas           text,
  idempotency_key text                  UNIQUE,
  created_at      timestamptz           NOT NULL DEFAULT now(),
  updated_at      timestamptz           NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant      ON public.pedidos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado      ON public.pedidos(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at  ON public.pedidos(created_at);

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedidos_select_staff" ON public.pedidos;
CREATE POLICY "pedidos_select_staff" ON public.pedidos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "pedidos_modify_mesero" ON public.pedidos;
CREATE POLICY "pedidos_modify_mesero" ON public.pedidos
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'mesero_amex'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: pedido_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pedido_items (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid          NOT NULL REFERENCES public.tenants(id),
  pedido_id   uuid          NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  receta_id   uuid          NOT NULL REFERENCES public.recetas(id),
  cantidad    integer       NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  notas       text,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON public.pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_items_tenant ON public.pedido_items(tenant_id);

ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido_items_select_staff" ON public.pedido_items;
CREATE POLICY "pedido_items_select_staff" ON public.pedido_items
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "pedido_items_modify_mesero" ON public.pedido_items;
CREATE POLICY "pedido_items_modify_mesero" ON public.pedido_items
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'mesero_amex'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: despachos ──────────────────────────────────────────────────────────
-- Ejecución concreta de una receta de servicio hacia una zona.
-- turno_id: FK en 0006.
CREATE TABLE IF NOT EXISTS public.despachos (
  id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                  NOT NULL REFERENCES public.tenants(id),
  receta_id       uuid                  NOT NULL REFERENCES public.recetas(id),
  pedido_id       uuid                  REFERENCES public.pedidos(id),
  turno_id        uuid,                 -- FK: ALTER TABLE en 0006
  zona            public.zona_servicio  NOT NULL,
  cantidad        integer               NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  responsable_id  uuid                  REFERENCES public.users(id),
  idempotency_key text                  UNIQUE,
  despachado_at   timestamptz           NOT NULL DEFAULT now(),
  created_at      timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despachos_tenant      ON public.despachos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_despachos_receta      ON public.despachos(receta_id);
CREATE INDEX IF NOT EXISTS idx_despachos_created_at  ON public.despachos(created_at);

ALTER TABLE public.despachos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "despachos_select_staff" ON public.despachos;
CREATE POLICY "despachos_select_staff" ON public.despachos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "despachos_modify_cocina" ON public.despachos;
CREATE POLICY "despachos_modify_cocina" ON public.despachos
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'personal_snack', 'personal_buffet'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- =============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.despachos;
-- DROP TABLE IF EXISTS public.pedido_items;
-- DROP TABLE IF EXISTS public.pedidos;
-- DROP TABLE IF EXISTS public.tandas_produccion;
-- DROP TYPE IF EXISTS public.estado_pedido;
-- DROP TYPE IF EXISTS public.estado_tanda;
-- =============================================================================
