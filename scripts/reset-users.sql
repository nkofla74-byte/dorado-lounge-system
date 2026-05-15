-- =============================================================================
-- reset-users.sql — Borrar y recrear todos los usuarios del sistema
-- Dorado Lounge · GISAT S.A. · El Dorado, Bogotá
--
-- Pegar y ejecutar directamente en el SQL Editor de Supabase.
--
-- Maneja todas las FK hacia public.users:
--   · Columnas nullable  → SET NULL (conserva el dato histórico)
--   · mensajes_chat      → DELETE (remitente_id es NOT NULL, no se puede nullificar)
-- =============================================================================

DO $$
DECLARE
  v_tenant    uuid := 'd0ead0f0-1000-0000-0000-000000000001';
  v_pwd_hash  text;

  u_admin       uuid := 'a0e0a000-0000-0000-0000-000000000001';
  u_chef        uuid := 'a0e0a000-0000-0000-0000-000000000002';
  u_soushef     uuid := 'a0e0a000-0000-0000-0000-000000000003';
  u_mesero      uuid := 'a0e0a000-0000-0000-0000-000000000004';
  u_recepcion   uuid := 'a0e0a000-0000-0000-0000-000000000005';
  u_snack       uuid := 'a0e0a000-0000-0000-0000-000000000006';
  u_buffet      uuid := 'a0e0a000-0000-0000-0000-000000000007';
  u_almacen     uuid := 'a0e0a000-0000-0000-0000-000000000008';
  u_pasteleria  uuid := 'a0e0a000-0000-0000-0000-000000000009';
  u_steward     uuid := 'a0e0a000-0000-0000-0000-000000000010';
BEGIN

  -- ── 1. Desatar todas las FK nullable hacia public.users ──────────────────
  -- (conserva los registros históricos, solo desvincula el usuario)
  UPDATE public.movimientos_inventario SET usuario_id     = NULL WHERE usuario_id     IS NOT NULL;
  UPDATE public.lotes                  SET registrado_por = NULL WHERE registrado_por IS NOT NULL;
  UPDATE public.mermas                 SET registrado_por = NULL WHERE registrado_por IS NOT NULL;
  UPDATE public.tandas_produccion      SET responsable_id = NULL WHERE responsable_id IS NOT NULL;
  UPDATE public.pedidos                SET responsable_id = NULL WHERE responsable_id IS NOT NULL;
  UPDATE public.despachos              SET responsable_id = NULL WHERE responsable_id IS NOT NULL;
  UPDATE public.turnos                 SET responsable_id = NULL WHERE responsable_id IS NOT NULL;
  UPDATE public.buffet_tickets_turno   SET registrado_por = NULL WHERE registrado_por IS NOT NULL;
  UPDATE public.afluencia_ingresos     SET registrado_por = NULL WHERE registrado_por IS NOT NULL;
  UPDATE public.domain_events          SET created_by     = NULL WHERE created_by     IS NOT NULL;
  UPDATE public.audit_log              SET user_id        = NULL WHERE user_id        IS NOT NULL;

  -- mensajes_chat.remitente_id es NOT NULL → borrar los mensajes
  DELETE FROM public.mensajes_chat;

  RAISE NOTICE '✓ FK desatadas';

  -- ── 2. Borrar todos los usuarios ─────────────────────────────────────────
  -- CASCADE elimina public.users automáticamente (FK ON DELETE CASCADE)
  DELETE FROM auth.users;
  RAISE NOTICE '✓ Usuarios anteriores eliminados';

  -- ── 3. Garantizar que el tenant existe ───────────────────────────────────
  INSERT INTO public.tenants (id, nombre, slug, activo)
  VALUES (v_tenant, 'GISAT S.A. — Dorado Lounge', 'dorado-lounge', true)
  ON CONFLICT (id) DO NOTHING;
  RAISE NOTICE '✓ Tenant listo: %', v_tenant;

  -- ── 4. Hash de contraseña ────────────────────────────────────────────────
  v_pwd_hash := crypt('Admin123', gen_salt('bf'));

  -- ── 5. Crear usuarios en auth.users ─────────────────────────────────────
  --   raw_user_meta_data  → para el trigger handle_new_user
  --   raw_app_meta_data   → lo que leen las RLS y el JWT (crítico)
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at
  ) VALUES

    (u_admin,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@gisat.com', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'admin'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'admin'),
     now(), now()),

    (u_chef,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'chef@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'chef'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'chef'),
     now(), now()),

    (u_soushef,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'soushef@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'sous_chef'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'sous_chef'),
     now(), now()),

    (u_mesero,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'mesero@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'mesero_amex'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'mesero_amex'),
     now(), now()),

    (u_recepcion,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recepcion@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'recepcion'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'recepcion'),
     now(), now()),

    (u_snack,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'snack@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_snack'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_snack'),
     now(), now()),

    (u_buffet,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'buffet@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_buffet'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_buffet'),
     now(), now()),

    (u_almacen,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'almacen@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_almacen'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_almacen'),
     now(), now()),

    (u_pasteleria,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'pasteleria@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_pasteleria'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_pasteleria'),
     now(), now()),

    (u_steward,
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'steward@dorado.test', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'steward'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'steward'),
     now(), now());

  RAISE NOTICE '✓ 10 usuarios creados en auth.users';

  -- ── 6. Crear filas en public.users ───────────────────────────────────────
  INSERT INTO public.users (id, tenant_id, nombre, role, activo) VALUES
    (u_admin,      v_tenant, 'Administrador GISAT',    'admin',               true),
    (u_chef,       v_tenant, 'Chef Principal',          'chef',                true),
    (u_soushef,    v_tenant, 'Sous Chef',               'sous_chef',           true),
    (u_mesero,     v_tenant, 'Mesero Amex',             'mesero_amex',         true),
    (u_recepcion,  v_tenant, 'Recepción',               'recepcion',           true),
    (u_snack,      v_tenant, 'Personal Snack',          'personal_snack',      true),
    (u_buffet,     v_tenant, 'Personal Buffet',         'personal_buffet',     true),
    (u_almacen,    v_tenant, 'Personal Almacén',        'personal_almacen',    true),
    (u_pasteleria, v_tenant, 'Personal Pastelería',     'personal_pasteleria', true),
    (u_steward,    v_tenant, 'Steward',                 'steward',             true);

  RAISE NOTICE '✓ 10 usuarios creados en public.users';

  -- ── Resumen ──────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE 'CREDENCIALES  (contraseña: Admin123)';
  RAISE NOTICE '────────────────────────────────────────────────────';
  RAISE NOTICE '  admin@gisat.com        → admin               /inventario';
  RAISE NOTICE '  chef@dorado.test       → chef                /cocina';
  RAISE NOTICE '  soushef@dorado.test    → sous_chef           /cocina-amex';
  RAISE NOTICE '  mesero@dorado.test     → mesero_amex         /pedidos';
  RAISE NOTICE '  recepcion@dorado.test  → recepcion           /pedidos';
  RAISE NOTICE '  snack@dorado.test      → personal_snack      /snack';
  RAISE NOTICE '  buffet@dorado.test     → personal_buffet     /buffet';
  RAISE NOTICE '  almacen@dorado.test    → personal_almacen    /almacen';
  RAISE NOTICE '  pasteleria@dorado.test → personal_pasteleria /pasteleria';
  RAISE NOTICE '  steward@dorado.test    → steward             /produccion';
  RAISE NOTICE '════════════════════════════════════════════════════';

END;
$$;
