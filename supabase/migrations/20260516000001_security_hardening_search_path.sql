-- =============================================================================
-- security_hardening_search_path.sql
-- Hardening de seguridad: añade SET search_path = public a funciones
-- SECURITY DEFINER que no lo tenían, previniendo search-path attacks.
-- Idempotente — CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_assert_same_tenant(
  p_table  text,
  p_id     uuid,
  p_tenant uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  EXECUTE format('SELECT tenant_id FROM public.%I WHERE id = $1', p_table)
    INTO v_tenant
    USING p_id;

  IF v_tenant IS DISTINCT FROM p_tenant THEN
    RAISE EXCEPTION
      'Cross-tenant FK: %.id=% pertenece al tenant %, se esperaba %',
      p_table, p_id, v_tenant, p_tenant
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ROLLBACK: recrear sin SET search_path (no recomendado).
