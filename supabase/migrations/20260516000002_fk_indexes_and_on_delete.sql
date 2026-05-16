-- =============================================================================
-- fk_indexes_and_on_delete.sql
-- 1) Añade índices faltantes en columnas FK (performance de joins y deletes).
-- 2) Hace explícita la política ON DELETE para FKs que preservan historial
--    de audit/eventos cuando un usuario es removido.
-- Idempotente: usa IF NOT EXISTS para índices y recrea constraints sólo si
-- existen con la política equivocada.
-- =============================================================================

-- ── Índices en FKs sin índice dedicado ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_lote
  ON public.movimientos_inventario(lote_id);

CREATE INDEX IF NOT EXISTS idx_mermas_lote
  ON public.mermas(lote_id);

CREATE INDEX IF NOT EXISTS idx_despachos_pedido
  ON public.despachos(pedido_id);

CREATE INDEX IF NOT EXISTS idx_pedido_items_receta
  ON public.pedido_items(receta_id);

CREATE INDEX IF NOT EXISTS idx_alertas_leida_por
  ON public.alertas(leida_por);

-- ── ON DELETE SET NULL para preservar historial ───────────────────────────────
-- audit_log.user_id: si el usuario se elimina, la fila de auditoría se conserva
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_name = 'audit_log_user_id_fkey'
      AND delete_rule != 'SET NULL'
  ) THEN
    ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_user_id_fkey;
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- domain_events.created_by: idem
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_name = 'domain_events_created_by_fkey'
      AND delete_rule != 'SET NULL'
  ) THEN
    ALTER TABLE public.domain_events DROP CONSTRAINT domain_events_created_by_fkey;
    ALTER TABLE public.domain_events
      ADD CONSTRAINT domain_events_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- alertas.leida_por → auth.users: si el usuario se elimina, mantener la alerta
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_name = 'alertas_leida_por_fkey'
      AND delete_rule != 'SET NULL'
  ) THEN
    ALTER TABLE public.alertas DROP CONSTRAINT alertas_leida_por_fkey;
    ALTER TABLE public.alertas
      ADD CONSTRAINT alertas_leida_por_fkey
      FOREIGN KEY (leida_por) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
