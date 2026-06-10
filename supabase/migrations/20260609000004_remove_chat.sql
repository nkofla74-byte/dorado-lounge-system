-- =============================================================================
-- 20260609000004_remove_chat.sql
-- Baja del módulo chat (decisión del dueño 2026-05-28, plan maestro v2).
-- Destructiva — aplica al merge a main junto con 20260528000000 (gate dueño).
-- =============================================================================

DROP TABLE IF EXISTS public.mensajes_chat;
