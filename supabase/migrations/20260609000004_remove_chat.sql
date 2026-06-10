-- =============================================================================
-- 20260609000004_remove_chat.sql
-- Baja del módulo chat (decisión del dueño 2026-05-28, plan maestro v2).
-- Destructiva — aplica al merge a main junto con 20260528000000 (gate dueño).
-- =============================================================================

-- Retención (20260513000000 / 20260528000000): la vista y la función de purga
-- referencian mensajes_chat — se eliminan junto con la tabla, y se des-agenda
-- cualquier job pg_cron de purga de chat.
DROP VIEW IF EXISTS public.v_retencion_estado;
DROP FUNCTION IF EXISTS public.fn_purgar_mensajes_chat_antiguos();

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE command ILIKE '%fn_purgar_mensajes_chat_antiguos%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN NULL;
END $$;

DROP TABLE IF EXISTS public.mensajes_chat;
