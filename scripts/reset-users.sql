-- =============================================================================
-- reset-users.sql — Dorado Lounge · GISAT S.A.
-- Borrar todos los usuarios y recrearlos desde cero.
-- Ejecutar completo en Supabase → SQL Editor.
-- Contraseña de todos: Admin123
-- =============================================================================


-- ── PASO 1: Desatar FKs nullable que apuntan a public.users ─────────────────
UPDATE public.movimientos_inventario SET usuario_id     = NULL;
UPDATE public.lotes                  SET registrado_por = NULL;
UPDATE public.mermas                 SET registrado_por = NULL;
UPDATE public.tandas_produccion      SET responsable_id = NULL;
UPDATE public.pedidos                SET responsable_id = NULL;
UPDATE public.despachos              SET responsable_id = NULL;
UPDATE public.turnos                 SET responsable_id = NULL;
UPDATE public.buffet_tickets_turno   SET registrado_por = NULL;
UPDATE public.afluencia_ingresos     SET registrado_por = NULL;
UPDATE public.domain_events          SET created_by     = NULL;
UPDATE public.audit_log              SET user_id        = NULL;

-- mensajes_chat.remitente_id es NOT NULL → borrar filas
DELETE FROM public.mensajes_chat;


-- ── PASO 2: Borrar todos los usuarios ────────────────────────────────────────
-- CASCADE elimina public.users automáticamente (FK ON DELETE CASCADE)
DELETE FROM auth.users;


-- ── PASO 3: Garantizar tenant ────────────────────────────────────────────────
INSERT INTO public.tenants (id, nombre, slug, activo)
VALUES ('d0ead0f0-1000-0000-0000-000000000001', 'GISAT S.A. — Dorado Lounge', 'dorado-lounge', true)
ON CONFLICT (id) DO NOTHING;


-- ── PASO 4: Crear usuarios en auth.users ─────────────────────────────────────
-- Cada fila llama a crypt() con su propia sal — todos autentican con Admin123

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at
) VALUES

  ( 'a0e0a000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@gisat.com',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"admin"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"admin"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'chef@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"chef"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"chef"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'soushef@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"sous_chef"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"sous_chef"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'mesero@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"mesero_amex"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"mesero_amex"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'recepcion@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"recepcion"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"recepcion"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'snack@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_snack"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_snack"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'buffet@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_buffet"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_buffet"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'almacen@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_almacen"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_almacen"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'pasteleria@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_pasteleria"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"personal_pasteleria"}',
    now(), now() ),

  ( 'a0e0a000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'steward@dorado.test',
    crypt('Admin123', gen_salt('bf')), now(),
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"steward"}',
    '{"tenant_id":"d0ead0f0-1000-0000-0000-000000000001","role":"steward"}',
    now(), now() );


-- ── PASO 5: Crear filas en public.users ──────────────────────────────────────
INSERT INTO public.users (id, tenant_id, nombre, role, activo) VALUES
  ('a0e0a000-0000-0000-0000-000000000001', 'd0ead0f0-1000-0000-0000-000000000001', 'Administrador GISAT',    'admin',               true),
  ('a0e0a000-0000-0000-0000-000000000002', 'd0ead0f0-1000-0000-0000-000000000001', 'Chef Principal',          'chef',                true),
  ('a0e0a000-0000-0000-0000-000000000003', 'd0ead0f0-1000-0000-0000-000000000001', 'Sous Chef',               'sous_chef',           true),
  ('a0e0a000-0000-0000-0000-000000000004', 'd0ead0f0-1000-0000-0000-000000000001', 'Mesero Amex',             'mesero_amex',         true),
  ('a0e0a000-0000-0000-0000-000000000005', 'd0ead0f0-1000-0000-0000-000000000001', 'Recepción',               'recepcion',           true),
  ('a0e0a000-0000-0000-0000-000000000006', 'd0ead0f0-1000-0000-0000-000000000001', 'Personal Snack',          'personal_snack',      true),
  ('a0e0a000-0000-0000-0000-000000000007', 'd0ead0f0-1000-0000-0000-000000000001', 'Personal Buffet',         'personal_buffet',     true),
  ('a0e0a000-0000-0000-0000-000000000008', 'd0ead0f0-1000-0000-0000-000000000001', 'Personal Almacén',        'personal_almacen',    true),
  ('a0e0a000-0000-0000-0000-000000000009', 'd0ead0f0-1000-0000-0000-000000000001', 'Personal Pastelería',     'personal_pasteleria', true),
  ('a0e0a000-0000-0000-0000-000000000010', 'd0ead0f0-1000-0000-0000-000000000001', 'Steward',                 'steward',             true);


-- ── Verificación final ────────────────────────────────────────────────────────
SELECT u.email, p.role, p.nombre
FROM auth.users u
JOIN public.users p ON p.id = u.id
ORDER BY p.role;
