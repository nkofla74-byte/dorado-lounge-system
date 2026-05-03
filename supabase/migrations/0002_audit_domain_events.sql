-- =============================================================================
-- 0002_audit_domain_events.sql
-- domain_events (append-only) + audit_log (append-only + hash chain SHA-256)
-- Idempotente.
-- =============================================================================

-- ── Función genérica para bloquear UPDATE/DELETE en tablas append-only ────────
CREATE OR REPLACE FUNCTION public.prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es append-only: no se permiten UPDATE ni DELETE', TG_TABLE_NAME;
END;
$$;


-- ── Tabla: domain_events ──────────────────────────────────────────────────────
-- Registro inmutable de eventos de dominio. Fuente de verdad para auditoría y replay.
CREATE TABLE IF NOT EXISTS public.domain_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id),
  aggregate_id    uuid        NOT NULL,
  aggregate_type  text        NOT NULL,
  event_type      text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}',
  created_by      uuid        REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant     ON public.domain_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate  ON public.domain_events(tenant_id, aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_created_at ON public.domain_events(created_at);

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain_events_select_same_tenant" ON public.domain_events;
CREATE POLICY "domain_events_select_same_tenant" ON public.domain_events
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP TRIGGER IF EXISTS domain_events_no_update ON public.domain_events;
CREATE TRIGGER domain_events_no_update
  BEFORE UPDATE ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

DROP TRIGGER IF EXISTS domain_events_no_delete ON public.domain_events;
CREATE TRIGGER domain_events_no_delete
  BEFORE DELETE ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();


-- ── Tabla: audit_log ──────────────────────────────────────────────────────────
-- Append-only con hash chain SHA-256 para detección de tampering.
-- El trigger calcula prev_hash + hash en cada INSERT.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        REFERENCES public.tenants(id),   -- NULL = evento de plataforma
  user_id         uuid        REFERENCES public.users(id),
  action          text        NOT NULL,
  resource_type   text        NOT NULL,
  resource_id     uuid,
  payload         jsonb       NOT NULL DEFAULT '{}',
  ip_address      inet,
  prev_hash       text,
  hash            text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant     ON public.audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user       ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin')
  );

-- ── Función: hash chain para audit_log ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_log_set_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash text;
BEGIN
  -- Obtener el último hash del mismo tenant (o global si tenant_id es NULL)
  SELECT hash INTO v_prev_hash
  FROM public.audit_log
  WHERE
    CASE
      WHEN NEW.tenant_id IS NULL THEN tenant_id IS NULL
      ELSE tenant_id = NEW.tenant_id
    END
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  NEW.prev_hash := v_prev_hash;
  NEW.hash := encode(
    digest(
      COALESCE(v_prev_hash, '') ||
      NEW.id::text ||
      COALESCE(NEW.tenant_id::text, '') ||
      COALESCE(NEW.user_id::text, '') ||
      NEW.action ||
      NEW.resource_type ||
      COALESCE(NEW.resource_id::text, '') ||
      NEW.payload::text ||
      NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_before_insert ON public.audit_log;
CREATE TRIGGER audit_log_before_insert
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_set_hash();

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

DROP TRIGGER IF EXISTS audit_log_no_delete ON public.audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();


-- =============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.audit_log;
-- DROP TABLE IF EXISTS public.domain_events;
-- DROP FUNCTION IF EXISTS public.audit_log_set_hash();
-- DROP FUNCTION IF EXISTS public.prevent_mutation();
-- =============================================================================
