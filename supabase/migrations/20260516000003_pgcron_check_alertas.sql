-- Programa check-alertas cada 5 minutos vía pg_cron + pg_net.
-- Esto reemplaza el trigger de Vercel (Hobby limita a 1 cron/día).
-- El endpoint valida CRON_SECRET; URL y secret se leen de app.settings.

SET search_path = public;

-- ── Extensiones ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- ── Job idempotente ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-alertas') THEN
    PERFORM cron.unschedule('check-alertas');
  END IF;
END $$;

SELECT cron.schedule(
  'check-alertas',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url     := current_setting('app.cron_base_url', true) || '/api/cron/check-alertas',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || current_setting('app.cron_secret', true),
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb
  ) WHERE current_setting('app.cron_base_url', true) IS NOT NULL;
  $cron$
);

-- ── Post-deploy: configurar en Supabase Dashboard → SQL Editor ────────────────
-- ALTER DATABASE postgres SET app.cron_base_url = 'https://<proyecto>.vercel.app';
-- ALTER DATABASE postgres SET app.cron_secret   = '<valor de CRON_SECRET>';
--
-- En local (supabase/config.toml):
-- [db.settings]
-- "app.cron_base_url" = "http://localhost:3000"
-- "app.cron_secret"   = "dev-secret"
