-- =============================================================================
-- Utilidades de aserción para las pruebas de RLS/RPC.
-- Cada prueba corre dentro de una transacción que el runner revierte.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS test;

-- Simula una sesión de PostgREST: fija los claims del JWT y el rol de base.
-- `SET LOCAL` para que el efecto muera con la transacción de la prueba.
CREATE OR REPLACE FUNCTION test.login(p_user_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_claims jsonb;
BEGIN
  SELECT jsonb_build_object('sub', u.id::text, 'role', 'authenticated',
                            'app_metadata', u.raw_app_meta_data)
    INTO v_claims
  FROM auth.users u WHERE u.id = p_user_id;

  IF v_claims IS NULL THEN
    RAISE EXCEPTION 'test.login: usuario % no existe en el fixture', p_user_id;
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  SET LOCAL ROLE authenticated;
END $$;

-- Vuelve a la sesión privilegiada (equivalente a service_role en la app).
CREATE OR REPLACE FUNCTION test.logout() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

CREATE OR REPLACE FUNCTION test.assert(p_condition boolean, p_message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FALLÓ: %', p_message USING ERRCODE = 'assert_failure';
  END IF;
END $$;

-- Ejecuta SQL arbitrario y devuelve el número de filas afectadas.
-- Traduce un error de permisos/RLS a -1 para poder distinguir "denegado por
-- privilegio de tabla" de "invisible por RLS" (0 filas).
CREATE OR REPLACE FUNCTION test.exec_count(p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE v_count bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN -1;
END $$;

-- Ejecuta SQL esperando que falle; devuelve el SQLSTATE, o NULL si tuvo éxito.
CREATE OR REPLACE FUNCTION test.expect_error(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;

GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;
