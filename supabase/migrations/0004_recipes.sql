-- =============================================================================
-- 0004_recipes.sql
-- Recetas (STI: produccion / servicio) + ingredientes con coeficiente de merma
-- Idempotente.
-- =============================================================================

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.tipo_receta AS ENUM ('produccion', 'servicio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.zona_servicio AS ENUM ('amex', 'snack', 'buffet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── Tabla: recetas ────────────────────────────────────────────────────────────
-- STI:
--   tipo_receta = 'produccion' → transforma insumos capa_1 en insumo_destino_id (capa_2)
--   tipo_receta = 'servicio'   → descuenta insumos para despachar a una zona
CREATE TABLE IF NOT EXISTS public.recetas (
  id                uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid                 NOT NULL REFERENCES public.tenants(id),
  nombre            text                 NOT NULL,
  tipo_receta       public.tipo_receta   NOT NULL,
  zona              public.zona_servicio,           -- solo tipo 'servicio'
  insumo_destino_id uuid                 REFERENCES public.insumos(id),  -- solo tipo 'produccion'
  porciones         integer              NOT NULL DEFAULT 1 CHECK (porciones > 0),
  activo            boolean              NOT NULL DEFAULT true,
  created_at        timestamptz          NOT NULL DEFAULT now(),
  updated_at        timestamptz          NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT recetas_servicio_tiene_zona CHECK (
    tipo_receta <> 'servicio' OR zona IS NOT NULL
  ),
  CONSTRAINT recetas_produccion_tiene_destino CHECK (
    tipo_receta <> 'produccion' OR insumo_destino_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_recetas_tenant      ON public.recetas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recetas_tenant_tipo ON public.recetas(tenant_id, tipo_receta);

ALTER TABLE public.recetas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recetas_select_staff" ON public.recetas;
CREATE POLICY "recetas_select_staff" ON public.recetas
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "recetas_modify_admin" ON public.recetas;
CREATE POLICY "recetas_modify_admin" ON public.recetas
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin')
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: receta_ingredientes ────────────────────────────────────────────────
-- Un ingrediente por fila. merma_coeficiente determina cuánto se descuenta realmente:
--   cantidad_a_descontar = cantidad / (1 - merma_coeficiente)
CREATE TABLE IF NOT EXISTS public.receta_ingredientes (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid          NOT NULL REFERENCES public.tenants(id),
  receta_id         uuid          NOT NULL REFERENCES public.recetas(id) ON DELETE CASCADE,
  insumo_id         uuid          NOT NULL REFERENCES public.insumos(id),
  cantidad          numeric(12,4) NOT NULL CHECK (cantidad > 0),
  merma_coeficiente numeric(5,4)  NOT NULL DEFAULT 0
                                  CHECK (merma_coeficiente >= 0 AND merma_coeficiente < 1),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT receta_ingredientes_unique UNIQUE (receta_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_receta_ing_receta ON public.receta_ingredientes(receta_id);
CREATE INDEX IF NOT EXISTS idx_receta_ing_tenant ON public.receta_ingredientes(tenant_id);

ALTER TABLE public.receta_ingredientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receta_ing_select_staff" ON public.receta_ingredientes;
CREATE POLICY "receta_ing_select_staff" ON public.receta_ingredientes
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "receta_ing_modify_admin" ON public.receta_ingredientes;
CREATE POLICY "receta_ing_modify_admin" ON public.receta_ingredientes
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin')
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- =============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.receta_ingredientes;
-- DROP TABLE IF EXISTS public.recetas;
-- DROP TYPE IF EXISTS public.zona_servicio;
-- DROP TYPE IF EXISTS public.tipo_receta;
-- =============================================================================
