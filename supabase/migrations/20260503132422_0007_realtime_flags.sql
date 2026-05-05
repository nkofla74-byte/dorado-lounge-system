-- =============================================================================
-- 0007_realtime_flags.sql
-- mensajes_chat (append-only) + feature_flags
-- Idempotente.
-- =============================================================================

-- ── Tabla: mensajes_chat ──────────────────────────────────────────────────────
-- Los mensajes son inmutables una vez enviados (append-only via trigger).
-- canal refleja la topología Socket.io definida en shared-types/CHANNELS.
CREATE TABLE IF NOT EXISTS public.mensajes_chat (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id),
  canal         text        NOT NULL,
  remitente_id  uuid        NOT NULL REFERENCES public.users(id),
  contenido     text        NOT NULL,
  tipo          text        NOT NULL DEFAULT 'text'
                            CHECK (tipo IN ('text', 'image', 'alert', 'broadcast')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_tenant_canal   ON public.mensajes_chat(tenant_id, canal);
CREATE INDEX IF NOT EXISTS idx_chat_created_at     ON public.mensajes_chat(created_at);

ALTER TABLE public.mensajes_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_select_same_tenant" ON public.mensajes_chat;
CREATE POLICY "chat_select_same_tenant" ON public.mensajes_chat
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Mensajes son append-only
DROP TRIGGER IF EXISTS mensajes_chat_no_update ON public.mensajes_chat;
CREATE TRIGGER mensajes_chat_no_update
  BEFORE UPDATE ON public.mensajes_chat
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

DROP TRIGGER IF EXISTS mensajes_chat_no_delete ON public.mensajes_chat;
CREATE TRIGGER mensajes_chat_no_delete
  BEFORE DELETE ON public.mensajes_chat
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();


-- ── Tabla: feature_flags ──────────────────────────────────────────────────────
-- Flags de funcionalidades por tenant. NULL tenant_id = flag global.
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        REFERENCES public.tenants(id),
  clave       text        NOT NULL,
  valor       boolean     NOT NULL DEFAULT false,
  descripcion text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_unique UNIQUE (tenant_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_ff_tenant_clave ON public.feature_flags(tenant_id, clave);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ff_select_staff" ON public.feature_flags;
CREATE POLICY "ff_select_staff" ON public.feature_flags
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );

DROP POLICY IF EXISTS "ff_modify_superuser" ON public.feature_flags;
CREATE POLICY "ff_modify_superuser" ON public.feature_flags
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superuser')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'superuser');


-- =============================================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.feature_flags;
-- DROP TABLE IF EXISTS public.mensajes_chat;
-- =============================================================================
