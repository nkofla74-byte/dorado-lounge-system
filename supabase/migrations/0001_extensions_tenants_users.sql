-- =============================================================================
-- 0001_extensions_tenants_users.sql
-- Fundación multi-tenant: extensiones, tenants, users, RLS, trigger JWT claims
-- Idempotente: puede ejecutarse múltiples veces sin error.
-- =============================================================================

-- ── Extensiones ───────────────────────────────────────────────────────────────
-- pgcrypto provee gen_random_uuid() y digest() (requerido por audit_log §8.3)
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── Enum: roles de usuario ────────────────────────────────────────────────────
-- Fijos en código (ARCHITECTURE.md §16, CLAUDE.md §Roles).
-- Para agregar un rol: ALTER TYPE public.user_role ADD VALUE 'nuevo_rol';
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'superuser',
    'admin',
    'chef',
    'sous_chef',
    'mesero_amex',
    'personal_snack',
    'personal_buffet'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── Tabla: tenants ────────────────────────────────────────────────────────────
-- Tabla raíz del modelo multi-tenant. No tiene tenant_id.
-- Modificaciones solo vía service_role (operaciones de plataforma / superuser).
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text        NOT NULL,
  slug        text        NOT NULL,           -- subdomain / URL amigable
  activo      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT tenants_slug_unique UNIQUE (slug)
);


-- ── Tabla: public.users ───────────────────────────────────────────────────────
-- Extiende auth.users de Supabase con datos de negocio.
-- La fila se crea desde el backend con service_role al provisionar el usuario.
-- ON DELETE CASCADE: si se elimina el auth.user, se elimina también este perfil.
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid              PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   uuid              NOT NULL REFERENCES public.tenants(id),
  nombre      text              NOT NULL,
  role        public.user_role  NOT NULL,
  activo      boolean           NOT NULL DEFAULT true,
  created_at  timestamptz       NOT NULL DEFAULT now(),
  updated_at  timestamptz       NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id   ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON public.users(tenant_id, role);


-- ── RLS: tenants ──────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Un usuario autenticado solo puede leer su propio tenant.
-- Las claims se leen de app_metadata del JWT (pobladas por el trigger abajo).
DROP POLICY IF EXISTS "tenants_select_own" ON public.tenants;
CREATE POLICY "tenants_select_own" ON public.tenants
  FOR SELECT
  TO authenticated
  USING (id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── RLS: users ────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado ve solo los del mismo tenant
DROP POLICY IF EXISTS "users_select_same_tenant" ON public.users;
CREATE POLICY "users_select_same_tenant" ON public.users
  FOR SELECT
  TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- INSERT/UPDATE/DELETE: solo admin o superuser del mismo tenant
-- Para creación inicial de usuarios se usa service_role (bypass RLS)
DROP POLICY IF EXISTS "users_modify_admin" ON public.users;
CREATE POLICY "users_modify_admin" ON public.users
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin')
  )
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  );


-- ── Función: handle_new_user ──────────────────────────────────────────────────
-- Copia tenant_id y role desde raw_user_meta_data → raw_app_meta_data al crear
-- un usuario en auth.users. Esto hace que el JWT incluya esas claims bajo
-- app_metadata, que es lo que leen las políticas RLS.
--
-- El backend debe pasar tenant_id y role en user_metadata al crear el usuario:
--   supabase.auth.admin.createUser({ user_metadata: { tenant_id, role } })
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id text;
  v_role      text;
BEGIN
  v_tenant_id := NEW.raw_user_meta_data ->> 'tenant_id';
  v_role      := NEW.raw_user_meta_data ->> 'role';

  -- Solo inyectar si los datos están presentes.
  -- Usuarios de plataforma (superuser sin tenant) pueden no tenerlos.
  IF v_tenant_id IS NOT NULL AND v_role IS NOT NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb) ||
      jsonb_build_object('tenant_id', v_tenant_id, 'role', v_role)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger que dispara la función al crear un usuario en auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- ROLLBACK (ejecutar manualmente en orden inverso si es necesario):
--
-- DROP TRIGGER  IF EXISTS on_auth_user_created       ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP POLICY   IF EXISTS "users_modify_admin"        ON public.users;
-- DROP POLICY   IF EXISTS "users_select_same_tenant"  ON public.users;
-- DROP POLICY   IF EXISTS "tenants_select_own"        ON public.tenants;
-- DROP TABLE    IF EXISTS public.users;
-- DROP TABLE    IF EXISTS public.tenants;
-- DROP TYPE     IF EXISTS public.user_role;
-- =============================================================================
