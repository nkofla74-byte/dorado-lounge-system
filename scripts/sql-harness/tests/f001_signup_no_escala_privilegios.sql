-- F-001 (RC-1): el registro no debe poder fijar sus propios claims de autorización.
-- raw_user_meta_data lo controla quien se registra; app_metadata es la única
-- fuente de verdad de autorización y debe poblarse solo por vía server-side.
DO $$
DECLARE v_meta jsonb;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('deadbeef-0000-0000-0000-000000000001', 'atacante@evil.test',
          '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"superuser"}');

  SELECT raw_app_meta_data INTO v_meta
  FROM auth.users WHERE id = 'deadbeef-0000-0000-0000-000000000001';

  PERFORM test.assert(
    COALESCE(v_meta ->> 'role', '') <> 'superuser',
    'un signup logró fijar role=superuser en app_metadata');
END $$;

-- Tampoco debe poder auto-asignarse un rol legítimo de otro tenant.
DO $$
DECLARE v_meta jsonb;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('deadbeef-0000-0000-0000-000000000002', 'atacante2@evil.test',
          '{"tenant_id":"22222222-2222-2222-2222-222222222222","role":"admin"}');

  SELECT raw_app_meta_data INTO v_meta
  FROM auth.users WHERE id = 'deadbeef-0000-0000-0000-000000000002';

  PERFORM test.assert(
    COALESCE(v_meta ->> 'role', '') = '',
    'un signup logró fijar un rol arbitrario en app_metadata: ' || COALESCE(v_meta::text, 'NULL'));
END $$;

-- El aprovisionamiento server-side legítimo sí debe seguir funcionando: la app
-- crea la fila de perfil y luego fija los claims con la Admin API.
DO $$
DECLARE v_meta jsonb;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('deadbeef-0000-0000-0000-000000000003', 'legit@t1.test', '{}');

  PERFORM public.fn_provisionar_claims_usuario(
    'deadbeef-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'mesero_amex');

  SELECT raw_app_meta_data INTO v_meta
  FROM auth.users WHERE id = 'deadbeef-0000-0000-0000-000000000003';

  PERFORM test.assert(v_meta ->> 'role' = 'mesero_amex',
    'el aprovisionamiento server-side no fijó el rol');
  PERFORM test.assert(v_meta ->> 'tenant_id' = '11111111-1111-1111-1111-111111111111',
    'el aprovisionamiento server-side no fijó el tenant');
END $$;

-- Y ese aprovisionamiento nunca debe conceder superuser ni un tenant inexistente.
DO $$
BEGIN
  PERFORM test.assert(
    test.expect_error($q$SELECT public.fn_provisionar_claims_usuario(
      'deadbeef-0000-0000-0000-000000000003',
      '11111111-1111-1111-1111-111111111111', 'superuser')$q$) IS NOT NULL,
    'fn_provisionar_claims_usuario aceptó el rol superuser');

  PERFORM test.assert(
    test.expect_error($q$SELECT public.fn_provisionar_claims_usuario(
      'deadbeef-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-0000000000ff', 'admin')$q$) IS NOT NULL,
    'fn_provisionar_claims_usuario aceptó un tenant inexistente');
END $$;
