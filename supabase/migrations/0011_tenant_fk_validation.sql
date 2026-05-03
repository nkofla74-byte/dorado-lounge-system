-- =============================================================================
-- 0011_tenant_fk_validation.sql
-- Defensa en profundidad: triggers que garantizan que las FK cross-table
-- pertenecen al mismo tenant. RLS previene esto en condiciones normales,
-- pero estos triggers bloquean cualquier bypass via service_role accidental.
-- Idempotente.
-- =============================================================================


-- ── Función genérica de validación cross-tenant ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_assert_same_tenant(
  p_table  text,
  p_id     uuid,
  p_tenant uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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


-- ── receta_ingredientes ───────────────────────────────────────────────────────
-- insumo_id y receta_id deben pertenecer al mismo tenant que la fila

CREATE OR REPLACE FUNCTION public.fn_validate_receta_ingrediente_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('insumos',  NEW.insumo_id,  NEW.tenant_id);
  PERFORM public.fn_assert_same_tenant('recetas',  NEW.receta_id,  NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_receta_ingrediente_tenant ON public.receta_ingredientes;
CREATE TRIGGER tg_receta_ingrediente_tenant
  BEFORE INSERT OR UPDATE ON public.receta_ingredientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_receta_ingrediente_tenant();


-- ── tandas_produccion ─────────────────────────────────────────────────────────
-- receta_id debe pertenecer al mismo tenant que la tanda

CREATE OR REPLACE FUNCTION public.fn_validate_tanda_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('recetas', NEW.receta_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_tanda_tenant ON public.tandas_produccion;
CREATE TRIGGER tg_tanda_tenant
  BEFORE INSERT OR UPDATE OF receta_id, tenant_id ON public.tandas_produccion
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_tanda_tenant();


-- =============================================================================
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS tg_tanda_tenant             ON public.tandas_produccion;
-- DROP TRIGGER IF EXISTS tg_receta_ingrediente_tenant ON public.receta_ingredientes;
-- DROP FUNCTION IF EXISTS public.fn_validate_tanda_tenant();
-- DROP FUNCTION IF EXISTS public.fn_validate_receta_ingrediente_tenant();
-- DROP FUNCTION IF EXISTS public.fn_assert_same_tenant(text, uuid, uuid);
-- =============================================================================
