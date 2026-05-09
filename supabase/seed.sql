-- =============================================================================
-- seed.sql — Datos de demostración para Dorado Lounge
-- Idempotente: usa INSERT ... ON CONFLICT DO NOTHING y UUIDs fijos.
-- Ejecutar como service_role (bypass RLS).
--
-- NOTA: Todos los UUIDs usan solo caracteres hex válidos (0-9, a-f).
-- =============================================================================

-- ── 1. Tenant ─────────────────────────────────────────────────────────────────
INSERT INTO public.tenants (id, nombre, slug)
VALUES (
  'd0de0000-0000-4000-8000-000000000001',
  'Dorado Lounge — GISAT S.A.',
  'dorado-lounge'
)
ON CONFLICT (id) DO NOTHING;


-- ── 2. Usuarios auth + public.users ──────────────────────────────────────────
DO $$
DECLARE
  v_tenant_id uuid := 'd0de0000-0000-4000-8000-000000000001';
BEGIN

  -- Admin
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'da000000-ad00-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'admin@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'admin'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'admin'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('da000000-ad00-4000-8000-000000000001', v_tenant_id, 'Ana García (Admin)', 'admin')
  ON CONFLICT (id) DO NOTHING;

  -- Chef
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'da000000-cf00-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'chef@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'chef'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'chef'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('da000000-cf00-4000-8000-000000000002', v_tenant_id, 'Carlos Ríos (Chef)', 'chef')
  ON CONFLICT (id) DO NOTHING;

  -- Mesero Amex
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'da000000-0300-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'mesero@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'mesero_amex'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'mesero_amex'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('da000000-0300-4000-8000-000000000003', v_tenant_id, 'María López (Mesero)', 'mesero_amex')
  ON CONFLICT (id) DO NOTHING;

  -- Personal Snack
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
    aud, role, created_at, updated_at
  ) VALUES (
    'da000000-0400-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'snack@dorado.test',
    crypt('dorado2025!', gen_salt('bf')),
    now(),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'personal_snack'),
    jsonb_build_object('tenant_id', v_tenant_id, 'role', 'personal_snack'),
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role)
  VALUES ('da000000-0400-4000-8000-000000000004', v_tenant_id, 'Luis Herrera (Snack)', 'personal_snack')
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 3. Insumos capa_1 (materias primas) ───────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
BEGIN

  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    ('c1000000-0001-4000-8000-000000000001', v_tid, 'Pollo deshuesado',  'C1-POLLO', 'capa_1', 'kg',     5),
    ('c1000000-0002-4000-8000-000000000001', v_tid, 'Arroz blanco',      'C1-ARROZ', 'capa_1', 'kg',     3),
    ('c1000000-0003-4000-8000-000000000001', v_tid, 'Lechuga romana',    'C1-LECH',  'capa_1', 'kg',     2),
    ('c1000000-0004-4000-8000-000000000001', v_tid, 'Tomate cherry',     'C1-TOM',   'capa_1', 'kg',     1),
    ('c1000000-0005-4000-8000-000000000001', v_tid, 'Queso doble crema', 'C1-QUESO', 'capa_1', 'kg',     2),
    ('c1000000-0006-4000-8000-000000000001', v_tid, 'Almidón de yuca',   'C1-YUC',   'capa_1', 'kg',     5),
    ('c1000000-0007-4000-8000-000000000001', v_tid, 'Huevo',             'C1-HUEVO', 'capa_1', 'unidad', 24),
    ('c1000000-0008-4000-8000-000000000001', v_tid, 'Pan brioche',       'C1-PAN',   'capa_1', 'unidad', 10),
    ('c1000000-0009-4000-8000-000000000001', v_tid, 'Jamón serrano',     'C1-JAM',   'capa_1', 'g',      500),
    ('c1000000-000a-4000-8000-000000000001', v_tid, 'Jugo de naranja',   'C1-JUG',   'capa_1', 'ml',     2000)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 4. Insumos capa_2 (producción interna) ────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
BEGIN

  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    ('c2000000-0001-4000-8000-000000000001', v_tid, 'Pandebono',      'C2-PAND', 'capa_2', 'unidad', 20),
    ('c2000000-0002-4000-8000-000000000001', v_tid, 'Ensalada César', 'C2-ENSC', 'capa_2', 'porcion', 5),
    ('c2000000-0003-4000-8000-000000000001', v_tid, 'Arroz cocido',   'C2-ARRC', 'capa_2', 'porcion', 10)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 5. Lotes iniciales (stock de apertura) ────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
BEGIN

  INSERT INTO public.lotes (id, tenant_id, insumo_id, cantidad_inicial, cantidad_actual, fecha_vencimiento, proveedor, costo_unitario)
  VALUES
    ('10de0000-0001-4000-8000-000000000001', v_tid, 'c1000000-0001-4000-8000-000000000001', 10,   10,   CURRENT_DATE + 5,  'Frigorex',       18500),
    ('10de0000-0002-4000-8000-000000000001', v_tid, 'c1000000-0002-4000-8000-000000000001', 20,   20,   CURRENT_DATE + 60, 'Arroz Diana',    2800),
    ('10de0000-0003-4000-8000-000000000001', v_tid, 'c1000000-0003-4000-8000-000000000001', 5,    5,    CURRENT_DATE + 3,  'Mercafresh',     4200),
    ('10de0000-0004-4000-8000-000000000001', v_tid, 'c1000000-0004-4000-8000-000000000001', 3,    3,    CURRENT_DATE + 4,  'Mercafresh',     6500),
    ('10de0000-0005-4000-8000-000000000001', v_tid, 'c1000000-0005-4000-8000-000000000001', 4,    4,    CURRENT_DATE + 10, 'Colanta',        22000),
    ('10de0000-0006-4000-8000-000000000001', v_tid, 'c1000000-0006-4000-8000-000000000001', 10,   10,   CURRENT_DATE + 90, 'Almidones Ltda', 3500),
    ('10de0000-0007-4000-8000-000000000001', v_tid, 'c1000000-0007-4000-8000-000000000001', 120,  120,  CURRENT_DATE + 7,  'Avicola El Rey', 780),
    ('10de0000-0008-4000-8000-000000000001', v_tid, 'c1000000-0008-4000-8000-000000000001', 50,   50,   CURRENT_DATE + 4,  'Bimbo',          1200),
    ('10de0000-0009-4000-8000-000000000001', v_tid, 'c1000000-0009-4000-8000-000000000001', 2000, 2000, CURRENT_DATE + 20, 'Noel',           85),
    ('10de0000-000a-4000-8000-000000000001', v_tid, 'c1000000-000a-4000-8000-000000000001', 5000, 5000, CURRENT_DATE + 2,  'Del Valle',      18)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 6. Recetas de producción (capa_1 → capa_2) ───────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
BEGIN

  -- Pandebono (tanda de 12 unidades)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, insumo_destino_id, porciones, area_produccion)
  VALUES (
    'aec00000-0001-4000-8000-000000000001', v_tid,
    'Pandebono (tanda 12 uds)', 'produccion',
    'c2000000-0001-4000-8000-000000000001', 12, 'pasteleria'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('bec00000-0001-4000-8000-000000000001', v_tid, 'aec00000-0001-4000-8000-000000000001', 'c1000000-0006-4000-8000-000000000001', 0.5,  0.05),
    ('bec00000-0002-4000-8000-000000000001', v_tid, 'aec00000-0001-4000-8000-000000000001', 'c1000000-0005-4000-8000-000000000001', 0.25, 0.03),
    ('bec00000-0003-4000-8000-000000000001', v_tid, 'aec00000-0001-4000-8000-000000000001', 'c1000000-0007-4000-8000-000000000001', 2,    0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Ensalada César (porción)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, insumo_destino_id, porciones, area_produccion)
  VALUES (
    'aec00000-0002-4000-8000-000000000001', v_tid,
    'Ensalada César (porción)', 'produccion',
    'c2000000-0002-4000-8000-000000000001', 1, 'cocina'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('bec00000-0004-4000-8000-000000000001', v_tid, 'aec00000-0002-4000-8000-000000000001', 'c1000000-0003-4000-8000-000000000001', 0.15, 0.10),
    ('bec00000-0005-4000-8000-000000000001', v_tid, 'aec00000-0002-4000-8000-000000000001', 'c1000000-0004-4000-8000-000000000001', 0.05, 0.05)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 7. Recetas de servicio (despacho a zona) ──────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
BEGIN

  -- Desayuno Ejecutivo (amex)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'aec00000-0003-4000-8000-000000000001', v_tid,
    'Desayuno Ejecutivo', 'servicio', 'amex', 1, 'cocina',
    'plato_fuerte',
    'Huevos al gusto, pan brioche tostado y jugo de naranja natural'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('bec00000-0006-4000-8000-000000000001', v_tid, 'aec00000-0003-4000-8000-000000000001', 'c1000000-0007-4000-8000-000000000001', 2,   0.00),
    ('bec00000-0007-4000-8000-000000000001', v_tid, 'aec00000-0003-4000-8000-000000000001', 'c1000000-0008-4000-8000-000000000001', 2,   0.00),
    ('bec00000-0008-4000-8000-000000000001', v_tid, 'aec00000-0003-4000-8000-000000000001', 'c1000000-000a-4000-8000-000000000001', 250, 0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Sándwich de Jamón (snack)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'aec00000-0004-4000-8000-000000000001', v_tid,
    'Sándwich de Jamón Serrano', 'servicio', 'snack', 1, 'cocina',
    'entrada',
    'Pan brioche con jamón serrano y queso doble crema'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('bec00000-0009-4000-8000-000000000001', v_tid, 'aec00000-0004-4000-8000-000000000001', 'c1000000-0008-4000-8000-000000000001', 2,    0.00),
    ('bec00000-000a-4000-8000-000000000001', v_tid, 'aec00000-0004-4000-8000-000000000001', 'c1000000-0009-4000-8000-000000000001', 60,   0.05),
    ('bec00000-000b-4000-8000-000000000001', v_tid, 'aec00000-0004-4000-8000-000000000001', 'c1000000-0005-4000-8000-000000000001', 0.04, 0.03)
  ON CONFLICT (id) DO NOTHING;

  -- Ensalada César Buffet
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'aec00000-0005-4000-8000-000000000001', v_tid,
    'Ensalada César Buffet', 'servicio', 'buffet', 1, 'cocina',
    'entrada',
    'Lechuga romana, tomate cherry y aderezo césar'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('bec00000-000c-4000-8000-000000000001', v_tid, 'aec00000-0005-4000-8000-000000000001', 'c2000000-0002-4000-8000-000000000001', 1, 0.00)
  ON CONFLICT (id) DO NOTHING;

  -- Pandebono 2 uds (snack)
  INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, zona, porciones, area_produccion, categoria_menu, descripcion)
  VALUES (
    'aec00000-0006-4000-8000-000000000001', v_tid,
    'Pandebono (2 uds)', 'servicio', 'snack', 1, 'pasteleria',
    'acompanante',
    'Pandebono artesanal de almidón de yuca y queso'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.receta_ingredientes (id, tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    ('bec00000-000d-4000-8000-000000000001', v_tid, 'aec00000-0006-4000-8000-000000000001', 'c2000000-0001-4000-8000-000000000001', 2, 0.00)
  ON CONFLICT (id) DO NOTHING;

END $$;


-- ── 8. Turno de demo ──────────────────────────────────────────────────────────
INSERT INTO public.turnos (id, tenant_id, nombre, responsable_id, activo)
VALUES (
  'de000000-0001-4000-8000-000000000001',
  'd0de0000-0000-4000-8000-000000000001',
  'Turno Mañana — Demo',
  'da000000-ad00-4000-8000-000000000001',
  true
)
ON CONFLICT (id) DO NOTHING;


-- ── 9. Movimientos de inventario (entradas iniciales por lote) ────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
        v_uid uuid := 'da000000-ad00-4000-8000-000000000001';
        v_tur uuid := 'de000000-0001-4000-8000-000000000001';
BEGIN
  INSERT INTO public.movimientos_inventario
    (id, tenant_id, insumo_id, lote_id, tipo, cantidad, turno_id, usuario_id, referencia_tipo, idempotency_key)
  VALUES
    ('0abe0000-0001-4000-8000-000000000001', v_tid, 'c1000000-0001-4000-8000-000000000001', '10de0000-0001-4000-8000-000000000001', 'entrada', 10,   v_tur, v_uid, 'compra', 'seed-mov-0001'),
    ('0abe0000-0002-4000-8000-000000000001', v_tid, 'c1000000-0002-4000-8000-000000000001', '10de0000-0002-4000-8000-000000000001', 'entrada', 20,   v_tur, v_uid, 'compra', 'seed-mov-0002'),
    ('0abe0000-0003-4000-8000-000000000001', v_tid, 'c1000000-0003-4000-8000-000000000001', '10de0000-0003-4000-8000-000000000001', 'entrada', 5,    v_tur, v_uid, 'compra', 'seed-mov-0003'),
    ('0abe0000-0004-4000-8000-000000000001', v_tid, 'c1000000-0004-4000-8000-000000000001', '10de0000-0004-4000-8000-000000000001', 'entrada', 3,    v_tur, v_uid, 'compra', 'seed-mov-0004'),
    ('0abe0000-0005-4000-8000-000000000001', v_tid, 'c1000000-0005-4000-8000-000000000001', '10de0000-0005-4000-8000-000000000001', 'entrada', 4,    v_tur, v_uid, 'compra', 'seed-mov-0005'),
    ('0abe0000-0006-4000-8000-000000000001', v_tid, 'c1000000-0006-4000-8000-000000000001', '10de0000-0006-4000-8000-000000000001', 'entrada', 10,   v_tur, v_uid, 'compra', 'seed-mov-0006'),
    ('0abe0000-0007-4000-8000-000000000001', v_tid, 'c1000000-0007-4000-8000-000000000001', '10de0000-0007-4000-8000-000000000001', 'entrada', 120,  v_tur, v_uid, 'compra', 'seed-mov-0007'),
    ('0abe0000-0008-4000-8000-000000000001', v_tid, 'c1000000-0008-4000-8000-000000000001', '10de0000-0008-4000-8000-000000000001', 'entrada', 50,   v_tur, v_uid, 'compra', 'seed-mov-0008'),
    ('0abe0000-0009-4000-8000-000000000001', v_tid, 'c1000000-0009-4000-8000-000000000001', '10de0000-0009-4000-8000-000000000001', 'entrada', 2000, v_tur, v_uid, 'compra', 'seed-mov-0009'),
    ('0abe0000-000a-4000-8000-000000000001', v_tid, 'c1000000-000a-4000-8000-000000000001', '10de0000-000a-4000-8000-000000000001', 'entrada', 5000, v_tur, v_uid, 'compra', 'seed-mov-000a')
  ON CONFLICT (idempotency_key) DO NOTHING;
END $$;


-- ── 10. Tandas de producción ──────────────────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
        v_chef uuid := 'da000000-cf00-4000-8000-000000000002';
        v_tur  uuid := 'de000000-0001-4000-8000-000000000001';
BEGIN
  INSERT INTO public.tandas_produccion
    (id, tenant_id, receta_id, turno_id, cantidad_tandas, estado, responsable_id, notas, idempotency_key)
  VALUES
    ('0add0000-0001-4000-8000-000000000001', v_tid, 'aec00000-0001-4000-8000-000000000001', v_tur, 2, 'completada',  v_chef, 'Tanda matutina completada — 24 pandebonos', 'seed-tanda-0001'),
    ('0add0000-0002-4000-8000-000000000001', v_tid, 'aec00000-0002-4000-8000-000000000001', v_tur, 1, 'completada',  v_chef, 'Ensaladas listas para el turno',             'seed-tanda-0002'),
    ('0add0000-0003-4000-8000-000000000001', v_tid, 'aec00000-0001-4000-8000-000000000001', v_tur, 1, 'en_proceso',  v_chef, 'Segunda tanda pandebonos en horno',          'seed-tanda-0003'),
    ('0add0000-0004-4000-8000-000000000001', v_tid, 'aec00000-0001-4000-8000-000000000001', v_tur, 1, 'planificada', v_chef, 'Planificada para la tarde',                  'seed-tanda-0004')
  ON CONFLICT (idempotency_key) DO NOTHING;
END $$;


-- ── 11. Pedidos y pedido_items ────────────────────────────────────────────────
DO $$
DECLARE v_tid  uuid := 'd0de0000-0000-4000-8000-000000000001';
        v_mes  uuid := 'da000000-0300-4000-8000-000000000003';
        v_snk  uuid := 'da000000-0400-4000-8000-000000000004';
        v_tur  uuid := 'de000000-0001-4000-8000-000000000001';
BEGIN
  INSERT INTO public.pedidos (id, tenant_id, turno_id, numero_mesa, responsable_id, estado, zona, origen, idempotency_key)
  VALUES
    ('0edd0000-0001-4000-8000-000000000001', v_tid, v_tur, 'A-01', v_mes, 'entregado',     'amex',  'mesero',      'seed-ped-0001'),
    ('0edd0000-0002-4000-8000-000000000001', v_tid, v_tur, 'A-02', v_mes, 'en_preparacion','amex',  'mesero',      'seed-ped-0002'),
    ('0edd0000-0003-4000-8000-000000000001', v_tid, v_tur, NULL,   v_snk, 'despachado',    'snack', 'mesero',      'seed-ped-0003')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pedido_items (id, tenant_id, pedido_id, receta_id, cantidad)
  VALUES
    ('0ed10000-0001-4000-8000-000000000001', v_tid, '0edd0000-0001-4000-8000-000000000001', 'aec00000-0003-4000-8000-000000000001', 2),
    ('0ed10000-0002-4000-8000-000000000001', v_tid, '0edd0000-0001-4000-8000-000000000001', 'aec00000-0006-4000-8000-000000000001', 2),
    ('0ed10000-0003-4000-8000-000000000001', v_tid, '0edd0000-0002-4000-8000-000000000001', 'aec00000-0003-4000-8000-000000000001', 1),
    ('0ed10000-0004-4000-8000-000000000001', v_tid, '0edd0000-0003-4000-8000-000000000001', 'aec00000-0004-4000-8000-000000000001', 3)
  ON CONFLICT (id) DO NOTHING;
END $$;


-- ── 12. Mermas ────────────────────────────────────────────────────────────────
DO $$
DECLARE v_tid  uuid := 'd0de0000-0000-4000-8000-000000000001';
        v_chef uuid := 'da000000-cf00-4000-8000-000000000002';
        v_tur  uuid := 'de000000-0001-4000-8000-000000000001';
BEGIN
  INSERT INTO public.mermas (id, tenant_id, insumo_id, lote_id, cantidad, categoria, descripcion, turno_id, registrado_por, idempotency_key)
  VALUES
    ('0e1a0000-0001-4000-8000-000000000001', v_tid, 'c1000000-0003-4000-8000-000000000001', '10de0000-0003-4000-8000-000000000001', 0.15, 'operativa',  'Recortes de lechuga en preparación',    v_tur, v_chef, 'seed-merma-0001'),
    ('0e1a0000-0002-4000-8000-000000000001', v_tid, 'c1000000-000a-4000-8000-000000000001', '10de0000-000a-4000-8000-000000000001', 200,  'vencimiento','Jugo vencido detectado en apertura',   v_tur, v_chef, 'seed-merma-0002'),
    ('0e1a0000-0003-4000-8000-000000000001', v_tid, 'c1000000-0001-4000-8000-000000000001', '10de0000-0001-4000-8000-000000000001', 0.10, 'operativa',  'Recortes en fileteo de pollo',          v_tur, v_chef, 'seed-merma-0003')
  ON CONFLICT (idempotency_key) DO NOTHING;
END $$;


-- ── 13. Afluencia de pasajeros ────────────────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
        v_adm uuid := 'da000000-ad00-4000-8000-000000000001';
        v_tur uuid := 'de000000-0001-4000-8000-000000000001';
BEGIN
  INSERT INTO public.afluencia_ingresos (id, tenant_id, turno_id, cantidad, zona, registrado_por, vuelo_numero)
  VALUES
    ('af100000-0001-4000-8000-000000000001', v_tid, v_tur, 12, 'amex',   v_adm, 'AV9641'),
    ('af100000-0002-4000-8000-000000000001', v_tid, v_tur, 8,  'snack',  v_adm, 'LA4031'),
    ('af100000-0003-4000-8000-000000000001', v_tid, v_tur, 20, 'buffet', v_adm, 'LA4031'),
    ('af100000-0004-4000-8000-000000000001', v_tid, v_tur, 15, 'amex',   v_adm, 'AV9700'),
    ('af100000-0005-4000-8000-000000000001', v_tid, v_tur, 6,  'snack',  v_adm, NULL)
  ON CONFLICT (id) DO NOTHING;
END $$;


-- ── 14. Buffet tickets al cierre ──────────────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
        v_snk uuid := 'da000000-0400-4000-8000-000000000004';
        v_tur uuid := 'de000000-0001-4000-8000-000000000001';
BEGIN
  INSERT INTO public.buffet_tickets_turno (id, tenant_id, turno_id, cantidad_tickets, registrado_por, idempotency_key)
  VALUES (
    'bf100000-0001-4000-8000-000000000001',
    v_tid, v_tur, 20, v_snk, 'seed-buffet-ticket-0001'
  ) ON CONFLICT (idempotency_key) DO NOTHING;
END $$;


-- ── 15. Feature flags ─────────────────────────────────────────────────────────
DO $$
DECLARE v_tid uuid := 'd0de0000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO public.feature_flags (id, tenant_id, clave, valor, descripcion)
  VALUES
    ('ff100000-0001-4000-8000-000000000001', v_tid, 'kds_enabled',          true,  'Habilita el Kitchen Display System (KDS)'),
    ('ff100000-0002-4000-8000-000000000001', v_tid, 'chat_enabled',         true,  'Habilita el chat entre estaciones'),
    ('ff100000-0003-4000-8000-000000000001', v_tid, 'analytics_enabled',    true,  'Habilita el módulo de analytics'),
    ('ff100000-0004-4000-8000-000000000001', v_tid, 'qr_pasajero_enabled',  true,  'Permite pedidos QR de pasajeros'),
    ('ff100000-0005-4000-8000-000000000001', v_tid, 'buffet_lotes_mode',    true,  'Buffet opera en modo lotes (vs. individual)')
  ON CONFLICT (tenant_id, clave) DO NOTHING;
END $$;


-- ── 16. Mensajes de chat ──────────────────────────────────────────────────────
DO $$
DECLARE v_tid  uuid := 'd0de0000-0000-4000-8000-000000000001';
        v_adm  uuid := 'da000000-ad00-4000-8000-000000000001';
        v_chef uuid := 'da000000-cf00-4000-8000-000000000002';
BEGIN
  INSERT INTO public.mensajes_chat (id, tenant_id, canal, remitente_id, contenido, tipo)
  VALUES
    ('ca000000-0001-4000-8000-000000000001', v_tid, 'sala:cocina',  v_chef, 'Iniciando turno, todo listo en cocina',              'text'),
    ('ca000000-0002-4000-8000-000000000001', v_tid, 'sala:cocina',  v_adm,  'Recibido chef, adelante',                            'text'),
    ('ca000000-0003-4000-8000-000000000001', v_tid, 'sala:admin',   v_adm,  'Atención: revisión de inventario a las 14:00',       'broadcast'),
    ('ca000000-0004-4000-8000-000000000001', v_tid, 'sala:cocina',  v_chef, 'Stock bajo de pandebonos, preparando nueva tanda',   'alert'),
    ('ca000000-0005-4000-8000-000000000001', v_tid, 'sala:cocina',  v_adm,  'Cerrando turno, todo en orden',                      'text')
  ON CONFLICT (id) DO NOTHING;
END $$;


-- =============================================================================
-- Credenciales de acceso (solo para ambientes de desarrollo/demo):
--   admin@dorado.test  / dorado2025!  → rol: admin
--   chef@dorado.test   / dorado2025!  → rol: chef
--   mesero@dorado.test / dorado2025!  → rol: mesero_amex
--   snack@dorado.test  / dorado2025!  → rol: personal_snack
-- =============================================================================
