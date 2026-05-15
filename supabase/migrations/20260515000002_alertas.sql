-- ──────────────────────────────────────────────────────────────────────────────
-- Sprint D: Motor de Alertas
-- Tabla alertas: stock mínimo, vencimiento, cambio de precio, demora AMEX.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.alertas (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid          NOT NULL REFERENCES public.tenants(id),
  tipo          text          NOT NULL
                              CHECK (tipo IN ('stock_minimo','vencimiento','cambio_precio','demora_amex')),
  severidad     text          NOT NULL DEFAULT 'warning'
                              CHECK (severidad IN ('info','warning','critical')),
  titulo        text          NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 255),
  mensaje       text          NOT NULL,
  resource_id   uuid,
  resource_tipo text          CHECK (resource_tipo IN ('insumo','lote','pedido')),
  leida         boolean       NOT NULL DEFAULT false,
  leida_at      timestamptz,
  leida_por     uuid          REFERENCES auth.users(id),
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_tenant_leida
  ON public.alertas(tenant_id, leida, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_resource
  ON public.alertas(tenant_id, resource_id)
  WHERE resource_id IS NOT NULL;

ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

-- Admin y superuser ven todas las alertas del tenant
DROP POLICY IF EXISTS "alertas_select_admin" ON public.alertas;
CREATE POLICY "alertas_select_admin" ON public.alertas
  FOR SELECT TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','superuser')
  );

-- personal_almacen y sous_chef solo ven alertas relevantes a su área
DROP POLICY IF EXISTS "alertas_select_area" ON public.alertas;
CREATE POLICY "alertas_select_area" ON public.alertas
  FOR SELECT TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (
      (auth.jwt() -> 'app_metadata' ->> 'role') IN ('personal_almacen')
        AND tipo IN ('stock_minimo','vencimiento','cambio_precio')
      OR
      (auth.jwt() -> 'app_metadata' ->> 'role') IN ('sous_chef','chef')
        AND tipo IN ('demora_amex','stock_minimo')
    )
  );

-- Solo admin/superuser crean alertas (también service_role desde Server Actions con admin client)
DROP POLICY IF EXISTS "alertas_insert_admin" ON public.alertas;
CREATE POLICY "alertas_insert_admin" ON public.alertas
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','superuser')
  );

-- Marcar como leída: cualquier rol que la pueda ver
DROP POLICY IF EXISTS "alertas_update_leida" ON public.alertas;
CREATE POLICY "alertas_update_leida" ON public.alertas
  FOR UPDATE TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
