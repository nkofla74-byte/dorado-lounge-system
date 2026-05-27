-- C-15: Move CRON_SECRET from pg_settings to Supabase Vault
-- pg_settings values are readable by authenticated users via current_setting().
-- Vault secrets are only accessible by service_role.

-- Step 1: Create a helper function that reads the secret from Vault,
-- falling back to pg_settings for backwards compatibility.
CREATE OR REPLACE FUNCTION public.fn_get_cron_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Try Vault first (requires: INSERT INTO vault.secrets (name, secret) VALUES ('cron_secret', '...'))
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  -- Fallback to pg_settings (deprecated — remove after Vault migration)
  IF v_secret IS NULL THEN
    v_secret := current_setting('app.cron_secret', true);
  END IF;

  RETURN v_secret;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_cron_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_get_cron_secret() FROM authenticated;

-- Step 2: Update the cron job to use the Vault-backed function
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
                 'Authorization', 'Bearer ' || public.fn_get_cron_secret(),
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb
  ) WHERE current_setting('app.cron_base_url', true) IS NOT NULL
    AND public.fn_get_cron_secret() IS NOT NULL;
  $cron$
);

-- Step 3: Post-deploy manual step (run in SQL Editor):
-- INSERT INTO vault.secrets (name, secret) VALUES ('cron_secret', '<your CRON_SECRET value>');
-- ALTER DATABASE postgres RESET app.cron_secret;  -- remove from pg_settings
