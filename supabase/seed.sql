-- =============================================================================
-- seed.sql — Datos de demostración para Dorado Lounge
-- Idempotente: usa INSERT ... ON CONFLICT DO NOTHING y UUIDs fijos.
-- Ejecutar como service_role (bypass RLS).
-- =============================================================================

-- ── UUIDs fijos para reproducibilidad ─────────────────────────────────────────
-- tenant:    'd0rad0-0000-0000-0000-000000000001'
-- user admin:'d0rade-ad00-0000-0000-000000000001'
-- user chef: 'd0rade-cf00-0000-0000-000000000002'
-- user mesero:'d0rade-me00-0000-0000-000000000003'

-- ── 1. Tenant ─────────────────────────────────────────────────────────────────
INSERT INTO public.tenants (id, nombre, slug)
VALUES (
  'd0rad000-0000-0000-0000-000000000001',
  'Dorado Lounge — GISAT S.A.',
  'dorado-lounge'
)
ON CONFLICT (id) DO NOTHING;


-- ── 2. Usuarios auth + public.users ──────────────────────────────────────────
-- Se insertan en auth.users con hash bcrypt y app_metadata preconfigurado.
-- El trigger handle_new_user también actualizará raw_app_meta_data desde
-- raw_user_meta_data, pero como ya lo pasamos explícitamente es idempotente.

DO $$
DECLARE
  v_tenant_id uuid := 'd0rad000-0000-0000-0000-000000000001';
BEGIN

  -- Admin
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'd0rad000-ad00-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'admin'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'admin'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('d0rad000-ad00-0000-0000-000000000001', v_tenant_id, 'Ana García (Admin)', 'admin')
  ON CONFLICT (id) DO NOTHING;

  -- Chef
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'd0rad000-cf00-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'chef@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'chef'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'chef'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('d0rad000-cf00-0000-0000-000000000002', v_tenant_id, 'Carlos Ríos (Chef)', 'chef')
  ON CONFLICT (id) DO NOTHING;

  -- Mesero Amex
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'd0rad000-me00-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'mesero@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'mesero_amex'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'mesero_amex'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('d0rad000-me00-0000-0000-000000000003', v_tenant_id, 'María López (Mesero)', 'mesero_amex')
  ON CONFLICT (id) DO NOTHING;

  -- Personal Snack
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'd0rad000-sn00-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'snack@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'personal_snack'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'personal_snack'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('d0rad000-sn00-0000-0000-000000000004', v_tenant_id, 'Luis Herrera (Snack)', 'personal_snack')
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 3. Insumos capa_1 (materias primas) ───────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0rad000-0000-0000-0000-000000000001';
BEGIN

  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    ('d0ins000-0001-0000-0000-000000000001', v_tid, 'Pollo deshuesado', 'C1-POLLO', 'capa_1', 'kg', 5),
    ('d0ins000-0002-0000-0000-000000000001', v_tid, 'Arroz blanco', 'C1-ARROZ', 'capa_1', 'kg', 3),
    ('d0ins000-0003-0000-0000-000000000001', v_tid, 'Lechuga romana', 'C1-LECH', 'capa_1', 'kg', 2),
    ('d0ins000-0004-0000-0000-000000000001', v_tid, 'Tomate cherry', 'C1-TOM', 'capa_1', 'kg', 1),
    ('d0ins000-0005-0000-0000-000000000001', v_tid, 'Queso doble crema', 'C1-QUESO', 'capa_1', 'kg', 2),
    ('d0ins000-0006-0000-0000-000000000001', v_tid, 'Almidón de yuca', 'C1-YUC', 'capa_1', 'kg', 5),
    ('d0ins000-0007-0000-0000-000000000001', v_tid, 'Huevo', 'C1-HUEVO', 'capa_1', 'unidad', 24),
    ('d0ins000-0008-0000-0000-000000000001', v_tid, 'Pan brioche', 'C1-PAN', 'capa_1', 'unidad', 10),
    ('d0ins000-0009-0000-0000-000000000001', v_tid, 'Jamón serrano', 'C1-JAM', 'capa_1', 'g', 500),
    ('d0ins000-0010-0000-0000-000000000001', v_tid, 'Jugo de naranja', 'C1-JUG', 'capa_1', 'ml', 2000)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 4. Insumos capa_2 (producción interna) ────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0rad000-0000-0000-0000-000000000001';
BEGIN

  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    ('d0ins000-0101-0000-0000-000000000001', v_tid, 'Pandebono', 'C2-PAND', 'capa_2', 'unidad', 20),
    ('d0ins000-0102-0000-0000-000000000001', v_tid, 'Ensalada César', 'C2-ENSC', 'capa_2', 'porcion', 5),
    ('d0ins000-0103-0000-0000-000000000001', v_tid, 'Arroz cocido', 'C2-ARRC', 'capa_2', 'porcion', 10)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 5. Lotes iniciales (stock de apertura) ────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0rad000-0000-0000-0000-000000000001';
BEGIN

  INSERT INTO public.lotes (id, tenant_id, insumo_id, cantidad_inicial, cantidad_actual, fecha_vencimiento, proveedor, costo_unitario)
  VALUES
    ('d0lot000-0001-0000-0000-000000000001', v_tid, 'd0ins000-0001-0000-0000-000000000001', 10,   10,   CURRENT_DATE + 5,  'Frigorex',       18500),
    ('d0lot000-0002-0000-0000-000000000001', v_tid, 'd0ins000-0002-0000-0000-000000000001', 20,   20,   CURRENT_DATE + 60, 'Arroz Diana',    2800),
    ('d0lot000-0003-0000-0000-000000000001', v_tid, 'd0ins000-0003-0000-0000-000000000001', 5,    5,    CURRENT_DATE + 3,  'Mercafresh',     4200),
    ('d0lot000-0004-0000-0000-000000000001', v_tid, 'd0ins000-0004-0000-0000-000000000001', 3,    3,    CURRENT_DATE + 4,  'Mercafresh',     6500),
    ('d0lot000-0005-0000-0000-000000000001', v_tid, 'd0ins000-0005-0000-0000-000000000001', 4,    4,    CURRENT_DATE + 10, 'Colanta',        22000),
    ('d0lot000-0006-0000-0000-000000000001', v_tid, 'd0ins000-0006-0000-0000-000000000001', 10,   10,   CURRENT_DATE + 90, 'Almidones Ltda', 3500),
    ('d0lot000-0007-0000-0000-000000000001', v_tid, 'd0ins000-0007-0000-0000-000000000001', 120,  120,  CURRENT_DATE + 7,  'Avicola El Rey', 780),
    ('d0lot000-0008-0000-0000-000000000001', v_tid, 'd0ins000-0008-0000-0000-000000000001', 50,   50,   CURRENT_DATE + 4,  'Bimbo',          1200),
    ('d0lot000-0009-0000-0000-000000000001', v_tid, 'd0ins000-0009-0000-0000-000000000001', 2000, 2000, CURRENT_DATE + 20, 'Noel',           85),
    ('d0lot000-0010-0000-0000-000000000001', v_tid, 'd0ins000-0010-0000-0000-000000000001', 5000, 5000, CURRENT_DATE + 2,  'Del Valle',      18)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 6. Recetas de producción (capa_1 → capa_2) ───────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0rad000-0000-0000-0000-000000000001';
BEGIN

  -- Receta: Pandebono (tanda de 12 unidades)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, insumo_destino_id, porciones, area_produccion)
  VALUES (
    'd0rec000-p001-0000-0000-000000000001', v_tid,
    'Pandebono (tanda 12 uds)', 'produccion',
    'd0ins000-0101-0000-0000-000000000001', 12, 'pasteleria'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('d0ring-p001-0001-0000-000000000001', v_tid, 'd0rec000-p001-0000-0000-000000000001', 'd0ins000-0006-0000-0000-000000000001', 0.5,  0.05),
    ('d0ring-p001-0002-0000-000000000001', v_tid, 'd0rec000-p001-0000-0000-000000000001', 'd0ins000-0005-0000-0000-000000000001', 0.25, 0.03),
    ('d0ring-p001-0003-0000-000000000001', v_tid, 'd0rec000-p001-0000-0000-000000000001', 'd0ins000-0007-0000-0000-000000000001', 2,    0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Receta: Ensalada César (porción)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, insumo_destino_id, porciones, area_produccion)
  VALUES (
    'd0rec000-p002-0000-0000-000000000001', v_tid,
    'Ensalada César (porción)', 'produccion',
    'd0ins000-0102-0000-0000-000000000001', 1, 'cocina'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('d0ring-p002-0001-0000-000000000001', v_tid, 'd0rec000-p002-0000-0000-000000000001', 'd0ins000-0003-0000-0000-000000000001', 0.15, 0.10),
    ('d0ring-p002-0002-0000-000000000001', v_tid, 'd0rec000-p002-0000-0000-000000000001', 'd0ins000-0004-0000-0000-000000000001', 0.05, 0.05)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 7. Recetas de servicio (despacho a zona) ──────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0rad000-0000-0000-0000-000000000001';
BEGIN

  -- Desayuno Ejecutivo Amex (zona amex)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'd0rec000-s001-0000-0000-000000000001', v_tid,
    'Desayuno Ejecutivo', 'servicio', 'amex', 1, 'cocina',
    'plato_fuerte',
    'Huevos al gusto, pan brioche tostado y jugo de naranja natural'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('d0ring-s001-0001-0000-000000000001', v_tid, 'd0rec000-s001-0000-0000-000000000001', 'd0ins000-0007-0000-0000-000000000001', 2,   0.00),
    ('d0ring-s001-0002-0000-000000000001', v_tid, 'd0rec000-s001-0000-0000-000000000001', 'd0ins000-0008-0000-0000-000000000001', 2,   0.00),
    ('d0ring-s001-0003-0000-000000000001', v_tid, 'd0rec000-s001-0000-0000-000000000001', 'd0ins000-0010-0000-0000-000000000001', 250, 0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Sándwich de Jamón (zona snack)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'd0rec000-s002-0000-0000-000000000001', v_tid,
    'Sándwich de Jamón Serrano', 'servicio', 'snack', 1, 'cocina',
    'entrada',
    'Pan brioche con jamón serrano y queso doble crema'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('d0ring-s002-0001-0000-000000000001', v_tid, 'd0rec000-s002-0000-0000-000000000001', 'd0ins000-0008-0000-0000-000000000001', 2,   0.00),
    ('d0ring-s002-0002-0000-000000000001', v_tid, 'd0rec000-s002-0000-0000-000000000001', 'd0ins000-0009-0000-0000-000000000001', 60,  0.05),
    ('d0ring-s002-0003-0000-000000000001', v_tid, 'd0rec000-s002-0000-0000-000000000001', 'd0ins000-0005-0000-0000-000000000001', 0.04,0.03)
  ON CONFLICT (id) DO NOTHING;

  -- Ensalada César al buffet
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'd0rec000-s003-0000-0000-000000000001', v_tid,
    'Ensalada César Buffet', 'servicio', 'buffet', 1, 'cocina',
    'entrada',
    'Lechuga romana, tomate cherry y aderezo césar'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('d0ring-s003-0001-0000-000000000001', v_tid, 'd0rec000-s003-0000-0000-000000000001', 'd0ins000-0102-0000-0000-000000000001', 1, 0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Pandebono (snack — usando capa_2)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'd0rec000-s004-0000-0000-000000000001', v_tid,
    'Pandebono (2 uds)', 'servicio', 'snack', 1, 'pasteleria',
    'acompanante',
    'Pandebono artesanal de almidón de yuca y queso'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('d0ring-s004-0001-0000-000000000001', v_tid, 'd0rec000-s004-0000-0000-000000000001', 'd0ins000-0101-0000-0000-000000000001', 2, 0.00)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 8. Turno de demo ──────────────────────────────────────────────────────────
INSERT INTO public.turnos (id, tenant_id, nombre)
VALUES (
  'd0turn00-0001-0000-0000-000000000001',
  'd0rad000-0000-0000-0000-000000000001',
  'Turno Mañana — Demo'
)
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- Credenciales de acceso (solo para ambientes de desarrollo/demo):
--   admin@dorado.test  / dorado2025!  → rol: admin
--   chef@dorado.test   / dorado2025!  → rol: chef
--   mesero@dorado.test / dorado2025!  → rol: mesero_amex
--   snack@dorado.test  / dorado2025!  → rol: personal_snack
-- =============================================================================
