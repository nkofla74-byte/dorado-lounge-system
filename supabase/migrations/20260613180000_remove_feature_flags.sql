-- =============================================================================
-- Remoción del módulo feature_flags: scaffolding sin consumo (ningún feature
-- leía los flags para cambiar comportamiento). Decisión del dueño 2026-06-13.
-- Los 5 flags existentes eran datos demo inertes (2026-05-08).
-- Idempotente. El trigger y las policies caen con la tabla.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS public.feature_flags CASCADE;

COMMIT;
