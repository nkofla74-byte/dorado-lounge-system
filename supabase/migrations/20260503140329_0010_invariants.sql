-- =============================================================================
-- 0010_invariants.sql
-- Invariantes de negocio enforced en DB:
--   - auto updated_at en todas las tablas mutables
--   - máquina de estados pedidos (transiciones válidas)
--   - máquina de estados tandas_produccion
--   - validación insumo_destino_id de recetas debe ser capa_2
--   - RLS en operaciones_idempotentes
-- Idempotente.
-- =============================================================================


-- ── updated_at automático ─────────────────────────────────────────────────────
-- Una sola función reutilizable para todas las tablas con updated_at.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'users', 'insumos', 'lotes', 'recetas',
    'receta_ingredientes', 'tandas_produccion', 'pedidos',
    'turnos', 'feature_flags'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_set_updated_at
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END
$$;


-- ── Máquina de estados: pedidos ───────────────────────────────────────────────
-- Válido: creado → en_preparacion | cancelado
--         en_preparacion → despachado | cancelado
--         despachado → entregado
--         entregado / cancelado → terminal (inmutable)
CREATE OR REPLACE FUNCTION public.validate_pedido_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sin cambio de estado → no validar
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Estados terminales son inmutables
  IF OLD.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'Pedido en estado "%" es terminal e inmutable', OLD.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validar transición
  IF OLD.estado = 'creado' AND NEW.estado NOT IN ('en_preparacion', 'cancelado') THEN
    RAISE EXCEPTION 'Transición inválida en pedido: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'en_preparacion' AND NEW.estado NOT IN ('despachado', 'cancelado') THEN
    RAISE EXCEPTION 'Transición inválida en pedido: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'despachado' AND NEW.estado <> 'entregado' THEN
    RAISE EXCEPTION 'Transición inválida en pedido: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pedido_estado ON public.pedidos;
CREATE TRIGGER tg_pedido_estado
  BEFORE UPDATE OF estado ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.validate_pedido_estado();


-- ── Máquina de estados: tandas_produccion ─────────────────────────────────────
-- Válido: planificada → en_proceso | cancelada
--         en_proceso → completada | cancelada
--         completada / cancelada → terminal
CREATE OR REPLACE FUNCTION public.validate_tanda_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'Tanda en estado "%" es terminal e inmutable', OLD.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'planificada' AND NEW.estado NOT IN ('en_proceso', 'cancelada') THEN
    RAISE EXCEPTION 'Transición inválida en tanda: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'en_proceso' AND NEW.estado NOT IN ('completada', 'cancelada') THEN
    RAISE EXCEPTION 'Transición inválida en tanda: "%" → "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Registrar timestamps automáticamente
  IF NEW.estado = 'en_proceso' AND OLD.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  IF NEW.estado = 'completada' AND OLD.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_tanda_estado ON public.tandas_produccion;
CREATE TRIGGER tg_tanda_estado
  BEFORE UPDATE OF estado ON public.tandas_produccion
  FOR EACH ROW EXECUTE FUNCTION public.validate_tanda_estado();


-- ── Validación: receta produccion → insumo_destino_id debe ser capa_2 ─────────
CREATE OR REPLACE FUNCTION public.validate_receta_insumo_destino()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.insumo_destino_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.insumos
      WHERE id        = NEW.insumo_destino_id
        AND capa      = 'capa_2'
        AND tenant_id = NEW.tenant_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'insumo_destino_id "%" debe referenciar un insumo de capa_2 activo del mismo tenant',
        NEW.insumo_destino_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_receta_insumo_destino ON public.recetas;
CREATE TRIGGER tg_receta_insumo_destino
  BEFORE INSERT OR UPDATE OF insumo_destino_id, tenant_id ON public.recetas
  FOR EACH ROW EXECUTE FUNCTION public.validate_receta_insumo_destino();


-- ── RLS: operaciones_idempotentes — sin acceso directo de usuarios ─────────────
-- Solo accesible desde fn_descontar_insumo_fefo (SECURITY DEFINER / service_role).
ALTER TABLE public.operaciones_idempotentes ENABLE ROW LEVEL SECURITY;
-- Sin políticas = deny all para usuarios autenticados.
-- service_role y SECURITY DEFINER functions no están sujetos a RLS.


-- ── Índice para cleanup futuro de operaciones_idempotentes ────────────────────
CREATE INDEX IF NOT EXISTS idx_op_idem_created_at
  ON public.operaciones_idempotentes(created_at);


-- =============================================================================
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS tg_receta_insumo_destino ON public.recetas;
-- DROP TRIGGER IF EXISTS tg_tanda_estado          ON public.tandas_produccion;
-- DROP TRIGGER IF EXISTS tg_pedido_estado         ON public.pedidos;
-- (triggers tg_set_updated_at en cada tabla)
-- DROP FUNCTION IF EXISTS public.validate_receta_insumo_destino();
-- DROP FUNCTION IF EXISTS public.validate_tanda_estado();
-- DROP FUNCTION IF EXISTS public.validate_pedido_estado();
-- DROP FUNCTION IF EXISTS public.set_updated_at();
-- =============================================================================
