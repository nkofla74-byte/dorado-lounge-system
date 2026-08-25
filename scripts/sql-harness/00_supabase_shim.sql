-- =============================================================================
-- Shim mínimo de Supabase para validar las migraciones en un Postgres limpio.
-- SOLO PARA PRUEBAS. No se despliega: reproduce lo que Supabase provee de fábrica
-- (schema auth, auth.jwt()/auth.uid(), roles anon/authenticated/service_role,
-- schemas extensions/vault/cron y un stub de net.http_post).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;

-- pgcrypto vive en `extensions` en Supabase; aquí lo exponemos con un alias.
CREATE OR REPLACE FUNCTION extensions.digest(text, text) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS $$ SELECT public.digest($1, $2) $$;
CREATE OR REPLACE FUNCTION extensions.digest(bytea, text) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS $$ SELECT public.digest($1, $2) $$;

-- Roles de PostgREST.
DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase concede por defecto todos los privilegios de tabla en `public`.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- auth.users (subconjunto usado por las migraciones).
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data  jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Claims simulados: los tests fijan request.jwt.claims con set_config().
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
  $$;

-- Stubs de infraestructura que en Supabase aportan pg_net / pg_cron / vault.
CREATE OR REPLACE FUNCTION net.http_post(
  url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds int DEFAULT 5000
) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;

CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial PRIMARY KEY, jobname text, schedule text, command text
);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
  RETURNS bigint LANGUAGE sql AS
  $$ INSERT INTO cron.job(jobname, schedule, command) VALUES ($1,$2,$3) RETURNING jobid $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
  RETURNS boolean LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = $1; SELECT true $$;

CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, secret AS decrypted_secret FROM vault.secrets;
