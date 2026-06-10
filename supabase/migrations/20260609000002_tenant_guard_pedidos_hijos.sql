-- =============================================================================
-- 20260609000002_tenant_guard_pedidos_hijos.sql
-- Defensa en profundidad (patrón 0011): triggers que garantizan que las FK de
-- las tablas hijas de pedidos pertenecen al mismo tenant que la fila.
-- RLS cubre el caso normal; esto bloquea bypass accidental vía service_role.
-- Idempotente.
-- =============================================================================

-- ── pedido_items: pedido_id y receta_id del mismo tenant ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_pedido_item_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('pedidos', NEW.pedido_id, NEW.tenant_id);
  PERFORM public.fn_assert_same_tenant('recetas', NEW.receta_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pedido_item_tenant ON public.pedido_items;
CREATE TRIGGER tg_pedido_item_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pedido_item_tenant();

-- ── pedido_eventos: pedido_id del mismo tenant ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_pedido_evento_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('pedidos', NEW.pedido_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pedido_evento_tenant ON public.pedido_eventos;
CREATE TRIGGER tg_pedido_evento_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pedido_evento_tenant();

-- ── pedido_item_eventos: pedido_id e item_id del mismo tenant ────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_pedido_item_evento_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('pedidos', NEW.pedido_id, NEW.tenant_id);
  PERFORM public.fn_assert_same_tenant('pedido_items', NEW.item_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pedido_item_evento_tenant ON public.pedido_item_eventos;
CREATE TRIGGER tg_pedido_item_evento_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_item_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pedido_item_evento_tenant();
