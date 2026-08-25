-- =============================================================================
-- 20260822000002_rbac_matriz.sql
--
-- CAUSA RAÍZ RC-2 (hallazgos F-006, F-016, F-017, F-035) — auditoría 2026-08-22.
--
-- Existían DOS definiciones independientes de "quién puede hacer qué":
--   · apps/web/src/lib/auth/permissions.ts (viva, con pruebas)
--   · las listas de roles escritas a mano dentro de cada política RLS
-- La segunda quedó congelada en el modelo de roles de mayo de 2026, así que los
-- roles del refoco operacional (chef_cocina_fria/caliente, personal_pasteleria,
-- steward) pasaban assertCan y luego chocaban contra la RLS.
--
-- Esta migración crea la matriz en la base como tabla derivada de la constante
-- de TypeScript. El bloque marcado `rbac:generado` se produce con
-- `pnpm rbac:generate` y una prueba de vitest falla si alguien toca PERMISSIONS
-- sin regenerarlo. A partir de aquí, las políticas RLS consultan `fn_puede()`
-- en lugar de repetir listas de roles.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DELETE+INSERT.
-- =============================================================================

-- ── Tabla: rbac_permisos ─────────────────────────────────────────────────────
-- Sin tenant_id: la matriz es global al producto, no por sala.
CREATE TABLE IF NOT EXISTS public.rbac_permisos (
  permiso text             NOT NULL,
  role    public.user_role NOT NULL,
  PRIMARY KEY (permiso, role)
);

ALTER TABLE public.rbac_permisos ENABLE ROW LEVEL SECURITY;

-- Nadie la lee directamente desde PostgREST: el acceso va por fn_puede(), que
-- es SECURITY DEFINER. Sin políticas, la RLS deniega todo a anon/authenticated.
REVOKE ALL ON TABLE public.rbac_permisos FROM anon, authenticated;


-- ── Lectores de claims ───────────────────────────────────────────────────────
-- Un único punto donde se interpreta el JWT. Antes cada política repetía
-- `(auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid`, lo que hacía
-- imposible cambiar el formato de claims sin tocar 62 políticas.

CREATE OR REPLACE FUNCTION public.fn_jwt_tenant()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.fn_jwt_role()
RETURNS text
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

CREATE OR REPLACE FUNCTION public.fn_jwt_user()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT auth.uid()
$$;


-- ── fn_puede: autorización por permiso ───────────────────────────────────────
-- Espejo exacto de assertCan(): superuser tiene bypass total; el resto se
-- resuelve contra la matriz. SECURITY DEFINER porque rbac_permisos no es
-- legible por authenticated.
CREATE OR REPLACE FUNCTION public.fn_puede(p_permiso text)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.fn_jwt_role() IS NULL THEN false
    WHEN public.fn_jwt_role() = 'superuser' THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.rbac_permisos
      WHERE permiso = p_permiso
        AND role::text = public.fn_jwt_role()
    )
  END
$$;

-- Conveniencia: el predicado que repiten casi todas las políticas.
CREATE OR REPLACE FUNCTION public.fn_puede_en_tenant(p_permiso text, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT p_tenant_id IS NOT NULL
     AND p_tenant_id = public.fn_jwt_tenant()
     AND public.fn_puede(p_permiso)
$$;

REVOKE ALL ON FUNCTION public.fn_puede(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_puede(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_puede_en_tenant(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_puede_en_tenant(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_jwt_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_jwt_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_jwt_user() TO authenticated, service_role;


-- ── Contenido de la matriz ───────────────────────────────────────────────────
-- <<< rbac:generado — no editar a mano >>>
-- Derivado de apps/web/src/lib/auth/permissions.ts. Regenerar con `pnpm rbac:generate`.
DELETE FROM public.rbac_permisos;
INSERT INTO public.rbac_permisos (permiso, role) VALUES
  ('alertas:read', 'admin'),
  ('alertas:read', 'chef_cocina_caliente'),
  ('alertas:read', 'chef_cocina_fria'),
  ('alertas:read', 'personal_almacen'),
  ('alertas:read', 'sous_chef'),
  ('alertas:write', 'admin'),
  ('analytics:read', 'admin'),
  ('analytics:refresh', 'admin'),
  ('cocina_amex:read', 'admin'),
  ('cocina_amex:read', 'sous_chef'),
  ('cocina_amex:write', 'admin'),
  ('cocina_amex:write', 'sous_chef'),
  ('cocina_caliente:read', 'admin'),
  ('cocina_caliente:read', 'chef_cocina_caliente'),
  ('cocina_caliente:write', 'admin'),
  ('cocina_caliente:write', 'chef_cocina_caliente'),
  ('cocina_fria:read', 'admin'),
  ('cocina_fria:read', 'chef_cocina_fria'),
  ('cocina_fria:write', 'admin'),
  ('cocina_fria:write', 'chef_cocina_fria'),
  ('inventory:merma', 'admin'),
  ('inventory:merma', 'personal_almacen'),
  ('inventory:merma', 'sous_chef'),
  ('inventory:read', 'admin'),
  ('inventory:read', 'chef_cocina_caliente'),
  ('inventory:read', 'chef_cocina_fria'),
  ('inventory:read', 'personal_almacen'),
  ('inventory:read', 'personal_pasteleria'),
  ('inventory:read', 'sous_chef'),
  ('inventory:read', 'steward'),
  ('inventory:stock_out', 'admin'),
  ('inventory:stock_out', 'sous_chef'),
  ('inventory:write', 'admin'),
  ('inventory:write', 'personal_almacen'),
  ('inventory:write', 'sous_chef'),
  ('orders:cancel', 'admin'),
  ('orders:cancel', 'chef_cocina_caliente'),
  ('orders:cancel', 'chef_cocina_fria'),
  ('orders:cancel', 'mesero_amex'),
  ('orders:cancel', 'personal_buffet'),
  ('orders:cancel', 'personal_snack'),
  ('orders:cancel', 'sous_chef'),
  ('orders:create', 'admin'),
  ('orders:create', 'mesero_amex'),
  ('orders:create', 'personal_buffet'),
  ('orders:create', 'personal_snack'),
  ('orders:deliver', 'admin'),
  ('orders:deliver', 'mesero_amex'),
  ('orders:deliver', 'personal_buffet'),
  ('orders:deliver', 'personal_snack'),
  ('orders:dispatch', 'admin'),
  ('orders:dispatch', 'chef_cocina_caliente'),
  ('orders:dispatch', 'chef_cocina_fria'),
  ('orders:dispatch', 'sous_chef'),
  ('orders:read', 'admin'),
  ('orders:read', 'chef_cocina_caliente'),
  ('orders:read', 'chef_cocina_fria'),
  ('orders:read', 'mesero_amex'),
  ('orders:read', 'personal_buffet'),
  ('orders:read', 'personal_pasteleria'),
  ('orders:read', 'personal_snack'),
  ('orders:read', 'sous_chef'),
  ('orders:receive', 'admin'),
  ('orders:receive', 'chef_cocina_caliente'),
  ('orders:receive', 'chef_cocina_fria'),
  ('orders:receive', 'mesero_amex'),
  ('orders:receive', 'sous_chef'),
  ('orders:trace', 'admin'),
  ('pasteleria:read', 'admin'),
  ('pasteleria:read', 'personal_pasteleria'),
  ('pasteleria:write', 'admin'),
  ('pasteleria:write', 'personal_pasteleria'),
  ('production:read', 'admin'),
  ('production:read', 'chef_cocina_caliente'),
  ('production:read', 'chef_cocina_fria'),
  ('production:read', 'personal_buffet'),
  ('production:read', 'personal_pasteleria'),
  ('production:read', 'personal_snack'),
  ('production:read', 'sous_chef'),
  ('production:read', 'steward'),
  ('production:write', 'admin'),
  ('production:write', 'chef_cocina_caliente'),
  ('production:write', 'chef_cocina_fria'),
  ('production:write', 'personal_pasteleria'),
  ('production:write', 'sous_chef'),
  ('production:write', 'steward'),
  ('proveedores:read', 'admin'),
  ('proveedores:read', 'personal_almacen'),
  ('proveedores:write', 'admin'),
  ('proveedores:write', 'personal_almacen'),
  ('recipes:read', 'admin'),
  ('recipes:read', 'chef_cocina_caliente'),
  ('recipes:read', 'chef_cocina_fria'),
  ('recipes:read', 'mesero_amex'),
  ('recipes:read', 'personal_buffet'),
  ('recipes:read', 'personal_pasteleria'),
  ('recipes:read', 'personal_snack'),
  ('recipes:read', 'sous_chef'),
  ('recipes:write', 'admin'),
  ('requisiciones:cancel', 'admin'),
  ('requisiciones:cancel', 'chef_cocina_caliente'),
  ('requisiciones:cancel', 'chef_cocina_fria'),
  ('requisiciones:cancel', 'personal_pasteleria'),
  ('requisiciones:cancel', 'sous_chef'),
  ('requisiciones:confirmar', 'admin'),
  ('requisiciones:confirmar', 'chef_cocina_caliente'),
  ('requisiciones:confirmar', 'chef_cocina_fria'),
  ('requisiciones:confirmar', 'personal_pasteleria'),
  ('requisiciones:confirmar', 'sous_chef'),
  ('requisiciones:create', 'admin'),
  ('requisiciones:create', 'chef_cocina_caliente'),
  ('requisiciones:create', 'chef_cocina_fria'),
  ('requisiciones:create', 'personal_pasteleria'),
  ('requisiciones:create', 'sous_chef'),
  ('requisiciones:despachar', 'admin'),
  ('requisiciones:despachar', 'personal_almacen'),
  ('requisiciones:read', 'admin'),
  ('requisiciones:read', 'chef_cocina_caliente'),
  ('requisiciones:read', 'chef_cocina_fria'),
  ('requisiciones:read', 'personal_almacen'),
  ('requisiciones:read', 'personal_pasteleria'),
  ('requisiciones:read', 'sous_chef'),
  ('turnos:read', 'admin'),
  ('turnos:read', 'chef_cocina_caliente'),
  ('turnos:read', 'chef_cocina_fria'),
  ('turnos:read', 'mesero_amex'),
  ('turnos:read', 'personal_almacen'),
  ('turnos:read', 'personal_buffet'),
  ('turnos:read', 'personal_pasteleria'),
  ('turnos:read', 'personal_snack'),
  ('turnos:read', 'sous_chef'),
  ('turnos:read', 'steward'),
  ('turnos:write', 'admin'),
  ('turnos:write', 'chef_cocina_caliente'),
  ('turnos:write', 'chef_cocina_fria'),
  ('turnos:write', 'mesero_amex'),
  ('turnos:write', 'personal_almacen'),
  ('turnos:write', 'personal_buffet'),
  ('turnos:write', 'personal_pasteleria'),
  ('turnos:write', 'personal_snack'),
  ('turnos:write', 'sous_chef'),
  ('turnos:write', 'steward'),
  ('users:read', 'admin'),
  ('users:write', 'admin');
-- <<< /rbac:generado >>>

-- =============================================================================
-- ROLLBACK (manual):
--   DROP FUNCTION IF EXISTS public.fn_puede_en_tenant(text, uuid);
--   DROP FUNCTION IF EXISTS public.fn_puede(text);
--   DROP FUNCTION IF EXISTS public.fn_jwt_user();
--   DROP FUNCTION IF EXISTS public.fn_jwt_role();
--   DROP FUNCTION IF EXISTS public.fn_jwt_tenant();
--   DROP TABLE IF EXISTS public.rbac_permisos;
--   Requiere revertir antes 20260822000003 (las políticas dependen de fn_puede).
-- =============================================================================
