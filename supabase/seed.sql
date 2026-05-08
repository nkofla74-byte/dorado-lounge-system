-- =============================================================================
-- seed.sql — Datos de demostración para Dorado Lounge
-- Idempotente: usa INSERT ... ON CONFLICT DO NOTHING y UUIDs fijos.
-- Ejecutar como service_role (bypass RLS).
-- Todos los UUIDs usan solo caracteres hex válidos (0-9, a-f).
-- =============================================================================

-- ── UUIDs de referencia ───────────────────────────────────────────────────────
-- Tenant:         dead0000-0000-0000-0000-000000000001
-- Admin user:     dead0000-0001-0000-0000-000000000001
-- Chef user:      dead0000-0002-0000-0000-000000000001
-- Mesero user:    dead0000-0003-0000-0000-000000000001
-- Snack user:     dead0000-0004-0000-0000-000000000001
-- Insumos c1:     f00d0000-000x-0000-0000-000000000001  (x = 1..a)
-- Insumos c2:     f00d0000-01xx-0000-0000-000000000001  (xx = 01..03)
-- Lotes:          10fe0000-000x-0000-0000-000000000001  (x = 1..a)
-- Recetas:        cafe0000-00xx-0000-0000-000000000001  (xx = 01..06)
-- Ingredientes:   feed0000-xxxx-0000-0000-000000000001
-- Turno:          bee00000-0001-0000-0000-000000000001

-- ── 1. Tenant ─────────────────────────────────────────────────────────────────
INSERT INTO public.tenants (id, nombre, slug)
VALUES (
  'dead0000-0000-0000-0000-000000000001',
  'Dorado Lounge — GISAT S.A.',
  'dorado-lounge'
)
ON CONFLICT (id) DO NOTHING;


-- ── 2. Usuarios auth + public.users ──────────────────────────────────────────
DO $$
DECLARE
  v_tid uuid := 'dead0000-0000-0000-0000-000000000001';
BEGIN

  -- Admin
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'dead0000-0001-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tid, 'role', 'admin'),
    jsonb_build_object('tenant_id', v_tid, 'role', 'admin'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('dead0000-0001-0000-0000-000000000001', v_tid, 'Ana García (Admin)', 'admin')
  ON CONFLICT (id) DO NOTHING;

  -- Chef
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'dead0000-0002-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'chef@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tid, 'role', 'chef'),
    jsonb_build_object('tenant_id', v_tid, 'role', 'chef'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('dead0000-0002-0000-0000-000000000001', v_tid, 'Carlos Ríos (Chef)', 'chef')
  ON CONFLICT (id) DO NOTHING;

  -- Mesero Amex
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'dead0000-0003-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'mesero@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tid, 'role', 'mesero_amex'),
    jsonb_build_object('tenant_id', v_tid, 'role', 'mesero_amex'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('dead0000-0003-0000-0000-000000000001', v_tid, 'María López (Mesero)', 'mesero_amex')
  ON CONFLICT (id) DO NOTHING;

  -- Personal Snack
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'dead0000-0004-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'snack@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tid, 'role', 'personal_snack'),
    jsonb_build_object('tenant_id', v_tid, 'role', 'personal_snack'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('dead0000-0004-0000-0000-000000000001', v_tid, 'Luis Herrera (Snack)', 'personal_snack')
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 3. Insumos capa_1 (materias primas) ───────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'dead0000-0000-0000-0000-000000000001';
BEGIN

  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    ('f00d0000-0001-0000-0000-000000000001', v_tid, 'Pollo deshuesado',  'C1-POLLO', 'capa_1', 'kg',     5),
    ('f00d0000-0002-0000-0000-000000000001', v_tid, 'Arroz blanco',      'C1-ARROZ', 'capa_1', 'kg',     3),
    ('f00d0000-0003-0000-0000-000000000001', v_tid, 'Lechuga romana',    'C1-LECH',  'capa_1', 'kg',     2),
    ('f00d0000-0004-0000-0000-000000000001', v_tid, 'Tomate cherry',     'C1-TOM',   'capa_1', 'kg',     1),
    ('f00d0000-0005-0000-0000-000000000001', v_tid, 'Queso doble crema', 'C1-QUESO', 'capa_1', 'kg',     2),
    ('f00d0000-0006-0000-0000-000000000001', v_tid, 'Almidón de yuca',   'C1-YUC',   'capa_1', 'kg',     5),
    ('f00d0000-0007-0000-0000-000000000001', v_tid, 'Huevo',             'C1-HUEVO', 'capa_1', 'unidad', 24),
    ('f00d0000-0008-0000-0000-000000000001', v_tid, 'Pan brioche',       'C1-PAN',   'capa_1', 'unidad', 10),
    ('f00d0000-0009-0000-0000-000000000001', v_tid, 'Jamón serrano',     'C1-JAM',   'capa_1', 'g',     500),
    ('f00d0000-000a-0000-0000-000000000001', v_tid, 'Jugo de naranja',   'C1-JUG',   'capa_1', 'ml',   2000)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 4. Insumos capa_2 (producción interna) ────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'dead0000-0000-0000-0000-000000000001';
BEGIN

  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    ('f00d0000-0101-0000-0000-000000000001', v_tid, 'Pandebono',      'C2-PAND', 'capa_2', 'unidad', 20),
    ('f00d0000-0102-0000-0000-000000000001', v_tid, 'Ensalada César', 'C2-ENSC', 'capa_2', 'porcion', 5),
    ('f00d0000-0103-0000-0000-000000000001', v_tid, 'Arroz cocido',   'C2-ARRC', 'capa_2', 'porcion', 10)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 5. Lotes iniciales (stock de apertura) ────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'dead0000-0000-0000-0000-000000000001';
BEGIN

  INSERT INTO public.lotes (id, tenant_id, insumo_id, cantidad_inicial, cantidad_actual, fecha_vencimiento, proveedor, costo_unitario)
  VALUES
    ('10fe0000-0001-0000-0000-000000000001', v_tid, 'f00d0000-0001-0000-0000-000000000001', 10,   10,   CURRENT_DATE + 5,  'Frigorex',       18500),
    ('10fe0000-0002-0000-0000-000000000001', v_tid, 'f00d0000-0002-0000-0000-000000000001', 20,   20,   CURRENT_DATE + 60, 'Arroz Diana',    2800),
    ('10fe0000-0003-0000-0000-000000000001', v_tid, 'f00d0000-0003-0000-0000-000000000001', 5,    5,    CURRENT_DATE + 3,  'Mercafresh',     4200),
    ('10fe0000-0004-0000-0000-000000000001', v_tid, 'f00d0000-0004-0000-0000-000000000001', 3,    3,    CURRENT_DATE + 4,  'Mercafresh',     6500),
    ('10fe0000-0005-0000-0000-000000000001', v_tid, 'f00d0000-0005-0000-0000-000000000001', 4,    4,    CURRENT_DATE + 10, 'Colanta',        22000),
    ('10fe0000-0006-0000-0000-000000000001', v_tid, 'f00d0000-0006-0000-0000-000000000001', 10,   10,   CURRENT_DATE + 90, 'Almidones Ltda', 3500),
    ('10fe0000-0007-0000-0000-000000000001', v_tid, 'f00d0000-0007-0000-0000-000000000001', 120,  120,  CURRENT_DATE + 7,  'Avicola El Rey', 780),
    ('10fe0000-0008-0000-0000-000000000001', v_tid, 'f00d0000-0008-0000-0000-000000000001', 50,   50,   CURRENT_DATE + 4,  'Bimbo',          1200),
    ('10fe0000-0009-0000-0000-000000000001', v_tid, 'f00d0000-0009-0000-0000-000000000001', 2000, 2000, CURRENT_DATE + 20, 'Noel',           85),
    ('10fe0000-000a-0000-0000-000000000001', v_tid, 'f00d0000-000a-0000-0000-000000000001', 5000, 5000, CURRENT_DATE + 2,  'Del Valle',      18)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 6. Recetas de producción (capa_1 → capa_2) ───────────────────────────────
DO $$
DECLARE v_tid uuid := 'dead0000-0000-0000-0000-000000000001';
BEGIN

  -- Pandebono (tanda 12 uds)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, insumo_destino_id, porciones, area_produccion)
  VALUES (
    'cafe0000-0001-0000-0000-000000000001', v_tid,
    'Pandebono (tanda 12 uds)', 'produccion',
    'f00d0000-0101-0000-0000-000000000001', 12, 'pasteleria'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('feed0000-0001-0001-0000-000000000001', v_tid, 'cafe0000-0001-0000-0000-000000000001', 'f00d0000-0006-0000-0000-000000000001', 0.5,  0.05),
    ('feed0000-0001-0002-0000-000000000001', v_tid, 'cafe0000-0001-0000-0000-000000000001', 'f00d0000-0005-0000-0000-000000000001', 0.25, 0.03),
    ('feed0000-0001-0003-0000-000000000001', v_tid, 'cafe0000-0001-0000-0000-000000000001', 'f00d0000-0007-0000-0000-000000000001', 2,    0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Ensalada César (porción)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, insumo_destino_id, porciones, area_produccion)
  VALUES (
    'cafe0000-0002-0000-0000-000000000001', v_tid,
    'Ensalada César (porción)', 'produccion',
    'f00d0000-0102-0000-0000-000000000001', 1, 'cocina'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('feed0000-0002-0001-0000-000000000001', v_tid, 'cafe0000-0002-0000-0000-000000000001', 'f00d0000-0003-0000-0000-000000000001', 0.15, 0.10),
    ('feed0000-0002-0002-0000-000000000001', v_tid, 'cafe0000-0002-0000-0000-000000000001', 'f00d0000-0004-0000-0000-000000000001', 0.05, 0.05)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 7. Recetas de servicio (despacho a zona) ──────────────────────────────────
DO $$
DECLARE v_tid uuid := 'dead0000-0000-0000-0000-000000000001';
BEGIN

  -- Desayuno Ejecutivo (amex)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'cafe0000-0011-0000-0000-000000000001', v_tid,
    'Desayuno Ejecutivo', 'servicio', 'amex', 1, 'cocina',
    'plato_fuerte', 'Huevos al gusto, pan brioche tostado y jugo de naranja natural'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('feed0000-0011-0001-0000-000000000001', v_tid, 'cafe0000-0011-0000-0000-000000000001', 'f00d0000-0007-0000-0000-000000000001', 2,   0.00),
    ('feed0000-0011-0002-0000-000000000001', v_tid, 'cafe0000-0011-0000-0000-000000000001', 'f00d0000-0008-0000-0000-000000000001', 2,   0.00),
    ('feed0000-0011-0003-0000-000000000001', v_tid, 'cafe0000-0011-0000-0000-000000000001', 'f00d0000-000a-0000-0000-000000000001', 250, 0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Sándwich de Jamón Serrano (snack)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'cafe0000-0012-0000-0000-000000000001', v_tid,
    'Sándwich de Jamón Serrano', 'servicio', 'snack', 1, 'cocina',
    'entrada', 'Pan brioche con jamón serrano y queso doble crema'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('feed0000-0012-0001-0000-000000000001', v_tid, 'cafe0000-0012-0000-0000-000000000001', 'f00d0000-0008-0000-0000-000000000001', 2,    0.00),
    ('feed0000-0012-0002-0000-000000000001', v_tid, 'cafe0000-0012-0000-0000-000000000001', 'f00d0000-0009-0000-0000-000000000001', 60,   0.05),
    ('feed0000-0012-0003-0000-000000000001', v_tid, 'cafe0000-0012-0000-0000-000000000001', 'f00d0000-0005-0000-0000-000000000001', 0.04, 0.03)
  ON CONFLICT (id) DO NOTHING;

  -- Ensalada César Buffet (buffet — usa capa_2)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'cafe0000-0013-0000-0000-000000000001', v_tid,
    'Ensalada César Buffet', 'servicio', 'buffet', 1, 'cocina',
    'entrada', 'Lechuga romana, tomate cherry y aderezo césar'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('feed0000-0013-0001-0000-000000000001', v_tid, 'cafe0000-0013-0000-0000-000000000001', 'f00d0000-0102-0000-0000-000000000001', 1, 0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Pandebono 2 uds (snack — usa capa_2)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'cafe0000-0014-0000-0000-000000000001', v_tid,
    'Pandebono (2 uds)', 'servicio', 'snack', 1, 'pasteleria',
    'acompanante', 'Pandebono artesanal de almidón de yuca y queso'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('feed0000-0014-0001-0000-000000000001', v_tid, 'cafe0000-0014-0000-0000-000000000001', 'f00d0000-0101-0000-0000-000000000001', 2, 0.00)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 8. Turno de demo ──────────────────────────────────────────────────────────
INSERT INTO public.turnos (id, tenant_id, nombre)
VALUES (
  'bee00000-0001-0000-0000-000000000001',
  'dead0000-0000-0000-0000-000000000001',
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
