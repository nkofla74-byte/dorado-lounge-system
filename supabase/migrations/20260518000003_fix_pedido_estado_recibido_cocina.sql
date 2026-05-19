-- =============================================================================
-- fix_pedido_estado_recibido_cocina.sql
-- Corrige la maquina de estados SQL para incluir el estado AMEX recibido_cocina.
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_pedido_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  IF OLD.estado IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'Pedido en estado "%" es terminal e inmutable', OLD.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'creado' AND NEW.estado NOT IN (
    'recibido_cocina',
    'en_preparacion',
    'cancelado'
  ) THEN
    RAISE EXCEPTION 'Transicion invalida en pedido: "%" -> "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'recibido_cocina' AND NEW.estado NOT IN ('en_preparacion', 'cancelado') THEN
    RAISE EXCEPTION 'Transicion invalida en pedido: "%" -> "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'en_preparacion' AND NEW.estado NOT IN ('despachado', 'cancelado') THEN
    RAISE EXCEPTION 'Transicion invalida en pedido: "%" -> "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'despachado' AND NEW.estado <> 'entregado' THEN
    RAISE EXCEPTION 'Transicion invalida en pedido: "%" -> "%"', OLD.estado, NEW.estado
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_pedido_estado() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_pedido_estado() FROM anon, authenticated;
