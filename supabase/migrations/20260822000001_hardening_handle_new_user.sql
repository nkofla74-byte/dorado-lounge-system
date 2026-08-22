-- =============================================================================
-- 20260822000001_hardening_handle_new_user.sql
--
-- HALLAZGO F-001 (CRITICAL, causa raíz RC-1) — auditoría forense 2026-08-22.
--
-- `handle_new_user` copiaba NEW.raw_user_meta_data ->> 'role' y ->> 'tenant_id'
-- directamente a raw_app_meta_data. raw_user_meta_data es el campo `data` del
-- signup: lo controla íntegramente quien se registra. app_metadata es la ÚNICA
-- fuente de verdad de autorización del sistema (assertCan, middleware y todas
-- las políticas RLS leen auth.jwt() -> 'app_metadata').
--
-- Resultado: cualquier anónimo con la anon key pública podía ejecutar
--   supabase.auth.signUp({ email, password,
--     options: { data: { role: 'superuser', tenant_id: '<víctima>' } } })
-- y obtener el bypass total de superuser sobre cualquier tenant.
--
-- ESTE FIX:
--   1. `handle_new_user` deja de leer raw_user_meta_data. Ya no deriva ningún
--      claim del signup: el registro nunca decide su propia autorización.
--   2. Se introduce `fn_provisionar_claims_usuario`, el único camino server-side
--      para fijar claims. Valida que el rol sea asignable (nunca 'superuser') y
--      que el tenant exista. Solo ejecutable por service_role.
--
-- El aprovisionamiento legítimo no se rompe: reset-test-users.mjs ya fijaba
-- app_metadata con la Admin API, y superuser-repository.createUser pasa a
-- hacer lo mismo en este mismo commit.
--
-- Idempotente: CREATE OR REPLACE / REVOKE / GRANT.
-- =============================================================================

-- ── 1) El trigger deja de confiar en metadata del usuario ────────────────────
-- Se conserva la función (el trigger on_auth_user_created sigue apuntando a
-- ella) pero sin ninguna lectura de raw_user_meta_data. Queda como punto de
-- extensión para efectos server-side futuros sobre el alta de usuarios.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No se derivan claims de autorización desde el signup (F-001).
  -- Los claims se fijan exclusivamente vía fn_provisionar_claims_usuario o la
  -- Admin API de Supabase, ambos caminos server-side.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;


-- ── 2) Único camino válido para fijar claims de autorización ─────────────────
-- Valida invariantes que la app no puede garantizar por sí sola:
--   · el rol debe existir en el enum y NO puede ser 'superuser' (los superusers
--     se provisionan manualmente fuera de banda, nunca desde la aplicación);
--   · el tenant debe existir y estar vivo.
CREATE OR REPLACE FUNCTION public.fn_provisionar_claims_usuario(
  p_user_id   uuid,
  p_tenant_id uuid,
  p_role      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF p_role = 'superuser' THEN
    RAISE EXCEPTION 'No se puede provisionar el rol superuser desde la aplicación'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  BEGIN
    v_role := p_role::public.user_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Rol desconocido: %', p_role USING ERRCODE = 'check_violation';
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant inexistente o eliminado: %', p_tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario inexistente: %', p_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE auth.users
  SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('tenant_id', p_tenant_id::text, 'role', v_role::text)
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_provisionar_claims_usuario(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_provisionar_claims_usuario(uuid, uuid, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_provisionar_claims_usuario(uuid, uuid, text)
  TO service_role;

-- =============================================================================
-- ROLLBACK (manual):
--   Reaplicar el cuerpo de handle_new_user de 0001_extensions_tenants_users.sql.
--   NO RECOMENDADO: reabre la escalada de privilegios F-001. Antes de revertir,
--   deshabilitar el registro público en Supabase Auth.
--   DROP FUNCTION IF EXISTS public.fn_provisionar_claims_usuario(uuid, uuid, text);
-- =============================================================================
