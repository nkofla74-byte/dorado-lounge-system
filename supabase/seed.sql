-- =============================================================================
-- seed.sql — Datos de desarrollo / QA para Dorado Lounge System
-- Tenant: GISAT S.A. — Dorado Lounge, El Dorado, Bogotá
--
-- Crea:
--   1 tenant | 7 usuarios (todos los roles operativos)
--   17 insumos (15 capa_1 + 2 capa_2)
--   28 lotes con fechas de vencimiento variadas (para probar FEFO)
--   Movimientos de entrada (ledger inicial)
--   2 recetas de producción + 6 recetas de servicio (amex/snack/buffet)
--   1 turno activo (bloque 6a2) | 2 pedidos de KDS
--
-- Contraseña de todos los usuarios: DoradoTest2024!
-- Idempotente: ON CONFLICT DO NOTHING
-- IMPORTANTE: ejecutar solo en desarrollo/staging, NUNCA en producción.
-- =============================================================================

DO $$
DECLARE
  -- ─── Tenant ───────────────────────────────────────────────────────────────
  v_tenant     uuid := 'd0ead0f0-1000-0000-0000-000000000001';

  -- ─── Usuarios ─────────────────────────────────────────────────────────────
  u_superuser  uuid := 'd0ead0f0-2000-0000-0000-000000000001';
  u_admin      uuid := 'd0ead0f0-2000-0000-0000-000000000002';
  u_chef       uuid := 'd0ead0f0-2000-0000-0000-000000000003';
  u_sous_chef  uuid := 'd0ead0f0-2000-0000-0000-000000000004';
  u_amex       uuid := 'd0ead0f0-2000-0000-0000-000000000005';
  u_snack      uuid := 'd0ead0f0-2000-0000-0000-000000000006';
  u_buffet     uuid := 'd0ead0f0-2000-0000-0000-000000000007';

  -- ─── Insumos capa_1 (materias primas) ─────────────────────────────────────
  i_pollo      uuid := 'd0ead0f0-3100-0000-0000-000000000001';
  i_carne_res  uuid := 'd0ead0f0-3100-0000-0000-000000000002';
  i_harina     uuid := 'd0ead0f0-3100-0000-0000-000000000003';
  i_queso      uuid := 'd0ead0f0-3100-0000-0000-000000000004';
  i_huevos     uuid := 'd0ead0f0-3100-0000-0000-000000000005';
  i_leche      uuid := 'd0ead0f0-3100-0000-0000-000000000006';
  i_aceite     uuid := 'd0ead0f0-3100-0000-0000-000000000007';
  i_arroz      uuid := 'd0ead0f0-3100-0000-0000-000000000008';
  i_frijoles   uuid := 'd0ead0f0-3100-0000-0000-000000000009';
  i_lechuga    uuid := 'd0ead0f0-3100-0000-0000-000000000010';
  i_tomate     uuid := 'd0ead0f0-3100-0000-0000-000000000011';
  i_cafe       uuid := 'd0ead0f0-3100-0000-0000-000000000012';
  i_jugo_nrj   uuid := 'd0ead0f0-3100-0000-0000-000000000013';
  i_agua_gas   uuid := 'd0ead0f0-3100-0000-0000-000000000014';
  i_pan_art    uuid := 'd0ead0f0-3100-0000-0000-000000000015';

  -- ─── Insumos capa_2 (productos terminados internos) ───────────────────────
  i_pandebono  uuid := 'd0ead0f0-3200-0000-0000-000000000001';
  i_ensalada   uuid := 'd0ead0f0-3200-0000-0000-000000000002';

  -- ─── Recetas de producción (capa_1 → capa_2) ──────────────────────────────
  r_prod_pande   uuid := 'd0ead0f0-5100-0000-0000-000000000001';
  r_prod_ensa    uuid := 'd0ead0f0-5100-0000-0000-000000000002';

  -- ─── Recetas de servicio — Amex ───────────────────────────────────────────
  r_bandeja_ej   uuid := 'd0ead0f0-5200-0000-0000-000000000001';
  r_ensalada_sv  uuid := 'd0ead0f0-5200-0000-0000-000000000002';
  r_jugo_nrj     uuid := 'd0ead0f0-5200-0000-0000-000000000003';

  -- ─── Recetas de servicio — Snack ──────────────────────────────────────────
  r_pandebono_2  uuid := 'd0ead0f0-5300-0000-0000-000000000001';
  r_cafe_am      uuid := 'd0ead0f0-5300-0000-0000-000000000002';

  -- ─── Recetas de servicio — Buffet ─────────────────────────────────────────
  r_buffet       uuid := 'd0ead0f0-5400-0000-0000-000000000001';

  -- ─── Turno y pedidos ──────────────────────────────────────────────────────
  v_turno        uuid := 'd0ead0f0-6000-0000-0000-000000000001';
  v_pedido_1     uuid := 'd0ead0f0-7000-0000-0000-000000000001';
  v_pedido_2     uuid := 'd0ead0f0-7000-0000-0000-000000000002';

  v_pwd_hash     text;
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. TENANT
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.tenants (id, nombre, slug, activo)
  VALUES (v_tenant, 'GISAT S.A. — Dorado Lounge', 'dorado-lounge', true)
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. USUARIOS
  -- auth.users: bypasa confirmación de email; app_metadata se inyecta
  -- directamente (el trigger handle_new_user copia desde user_metadata).
  -- ──────────────────────────────────────────────────────────────────────────
  v_pwd_hash := crypt('DoradoTest2024!', gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at
  )
  VALUES
    (u_superuser, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'superuser@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'superuser'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'superuser'),
     now(), now()),

    (u_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'admin'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'admin'),
     now(), now()),

    (u_chef, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'chef@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'chef'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'chef'),
     now(), now()),

    (u_sous_chef, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'soschef@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'sous_chef'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'sous_chef'),
     now(), now()),

    (u_amex, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'amex@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'mesero_amex'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'mesero_amex'),
     now(), now()),

    (u_snack, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'snack@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_snack'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_snack'),
     now(), now()),

    (u_buffet, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'buffet@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_buffet'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_buffet'),
     now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role, activo)
  VALUES
    (u_superuser, v_tenant, 'Super Admin',       'superuser',       true),
    (u_admin,     v_tenant, 'Administrador',      'admin',           true),
    (u_chef,      v_tenant, 'Chef Principal',     'chef',            true),
    (u_sous_chef, v_tenant, 'Sous Chef',          'sous_chef',       true),
    (u_amex,      v_tenant, 'Mesero Amex',        'mesero_amex',     true),
    (u_snack,     v_tenant, 'Personal Snack',     'personal_snack',  true),
    (u_buffet,    v_tenant, 'Personal Buffet',    'personal_buffet', true)
  ON CONFLICT (id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. INSUMOS — CAPA 1 (materias primas de bodega)
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    (i_pollo,     v_tenant, 'Pechuga de pollo',    'INS-001', 'capa_1', 'kg',     2.0000),
    (i_carne_res, v_tenant, 'Carne de res molida', 'INS-002', 'capa_1', 'kg',     2.0000),
    (i_harina,    v_tenant, 'Harina de trigo',     'INS-003', 'capa_1', 'kg',     5.0000),
    (i_queso,     v_tenant, 'Queso costeño',        'INS-004', 'capa_1', 'kg',     2.0000),
    (i_huevos,    v_tenant, 'Huevos AA',            'INS-005', 'capa_1', 'unidad', 12.0000),
    (i_leche,     v_tenant, 'Leche entera',         'INS-006', 'capa_1', 'l',      1.0000),
    (i_aceite,    v_tenant, 'Aceite vegetal',       'INS-007', 'capa_1', 'l',      2.0000),
    (i_arroz,     v_tenant, 'Arroz blanco',         'INS-008', 'capa_1', 'kg',     5.0000),
    (i_frijoles,  v_tenant, 'Frijoles rojos',       'INS-009', 'capa_1', 'kg',     2.0000),
    (i_lechuga,   v_tenant, 'Lechuga romana',       'INS-010', 'capa_1', 'kg',     1.0000),
    (i_tomate,    v_tenant, 'Tomate chonto',        'INS-011', 'capa_1', 'kg',     1.0000),
    (i_cafe,      v_tenant, 'Café molido especial', 'INS-012', 'capa_1', 'kg',     0.5000),
    (i_jugo_nrj,  v_tenant, 'Jugo de naranja',      'INS-013', 'capa_1', 'l',      2.0000),
    (i_agua_gas,  v_tenant, 'Agua con gas 750ml',   'INS-014', 'capa_1', 'unidad', 6.0000),
    (i_pan_art,   v_tenant, 'Pan artesanal',        'INS-015', 'capa_1', 'unidad', 10.0000)
  ON CONFLICT (id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 4. INSUMOS — CAPA 2 (productos terminados internos, resultado de producción)
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo)
  VALUES
    (i_pandebono, v_tenant, 'Pandebono',      'PRD-001', 'capa_2', 'unidad',  12.0000),
    (i_ensalada,  v_tenant, 'Ensalada mixta', 'PRD-002', 'capa_2', 'porcion',  4.0000)
  ON CONFLICT (id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. LOTES
  -- Cada insumo tiene 2 lotes con fechas de vencimiento distintas para que
  -- fn_descontar_insumo_fefo descuente primero el que vence antes.
  -- Los lotes de verduras tienen vida corta (3–6 días); secos y congelados más.
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.lotes (
    id, tenant_id, insumo_id,
    cantidad_inicial, cantidad_actual,
    fecha_recibido, fecha_vencimiento, proveedor, costo_unitario,
    codigo
  )
  SELECT v.id, v.tenant_id, v.insumo_id,
         v.cantidad_inicial, v.cantidad_actual,
         v.fecha_recibido, v.fecha_vencimiento, v.proveedor, v.costo_unitario,
         -- codigo es NOT NULL + UNIQUE (tenant, codigo) desde 20260518000001;
         -- derivado del orden de los ids fijos → determinista entre corridas.
         'SEED-L' || lpad((row_number() OVER (ORDER BY v.id))::text, 3, '0')
  FROM (VALUES
    -- Pechuga de pollo
    ('d0ead0f0-4100-0000-0000-000000000001'::uuid, v_tenant, i_pollo,
      5.0000,  5.0000, CURRENT_DATE - 3, CURRENT_DATE + 4,  'Pollo Olímpico S.A.',   14800.00),
    ('d0ead0f0-4100-0000-0000-000000000002', v_tenant, i_pollo,
     10.0000, 10.0000, CURRENT_DATE - 1, CURRENT_DATE + 9,  'Pollo Olímpico S.A.',   14500.00),

    -- Carne de res molida
    ('d0ead0f0-4100-0000-0000-000000000003', v_tenant, i_carne_res,
      4.0000,  4.0000, CURRENT_DATE - 2, CURRENT_DATE + 5,  'Carnes La Dorada',      22000.00),
    ('d0ead0f0-4100-0000-0000-000000000004', v_tenant, i_carne_res,
      6.0000,  6.0000, CURRENT_DATE,     CURRENT_DATE + 10, 'Carnes La Dorada',      21500.00),

    -- Harina de trigo
    ('d0ead0f0-4100-0000-0000-000000000005', v_tenant, i_harina,
     10.0000, 10.0000, CURRENT_DATE - 5, CURRENT_DATE + 25, 'Harinera del Valle',     3200.00),
    ('d0ead0f0-4100-0000-0000-000000000006', v_tenant, i_harina,
     15.0000, 15.0000, CURRENT_DATE - 1, CURRENT_DATE + 30, 'Harinera del Valle',     3100.00),

    -- Queso costeño
    ('d0ead0f0-4100-0000-0000-000000000007', v_tenant, i_queso,
      3.0000,  3.0000, CURRENT_DATE - 4, CURRENT_DATE + 6,  'Lácteos Montería',      28500.00),
    ('d0ead0f0-4100-0000-0000-000000000008', v_tenant, i_queso,
      5.0000,  5.0000, CURRENT_DATE - 1, CURRENT_DATE + 12, 'Lácteos Montería',      27800.00),

    -- Huevos AA
    ('d0ead0f0-4100-0000-0000-000000000009', v_tenant, i_huevos,
     30.0000, 30.0000, CURRENT_DATE - 3, CURRENT_DATE + 7,  'Avícola San Rafael',      480.00),
    ('d0ead0f0-4100-0000-0000-000000000010', v_tenant, i_huevos,
     60.0000, 60.0000, CURRENT_DATE,     CURRENT_DATE + 14, 'Avícola San Rafael',      460.00),

    -- Leche entera
    ('d0ead0f0-4100-0000-0000-000000000011', v_tenant, i_leche,
      4.0000,  4.0000, CURRENT_DATE - 2, CURRENT_DATE + 5,  'Alpina S.A.',            3800.00),
    ('d0ead0f0-4100-0000-0000-000000000012', v_tenant, i_leche,
      8.0000,  8.0000, CURRENT_DATE,     CURRENT_DATE + 8,  'Alpina S.A.',            3750.00),

    -- Aceite vegetal (no vence en el corto plazo)
    ('d0ead0f0-4100-0000-0000-000000000013', v_tenant, i_aceite,
      3.0000,  3.0000, CURRENT_DATE - 7, CURRENT_DATE + 53, 'Grasco S.A.',            8900.00),

    -- Arroz blanco
    ('d0ead0f0-4100-0000-0000-000000000014', v_tenant, i_arroz,
     10.0000, 10.0000, CURRENT_DATE - 5, CURRENT_DATE + 175,'Arroz Diana',            3600.00),
    ('d0ead0f0-4100-0000-0000-000000000015', v_tenant, i_arroz,
     15.0000, 15.0000, CURRENT_DATE - 1, CURRENT_DATE + 180,'Arroz Diana',            3500.00),

    -- Frijoles rojos
    ('d0ead0f0-4100-0000-0000-000000000016', v_tenant, i_frijoles,
      5.0000,  5.0000, CURRENT_DATE - 3, CURRENT_DATE + 177,'Frijoles El Rey',        5200.00),
    ('d0ead0f0-4100-0000-0000-000000000017', v_tenant, i_frijoles,
      8.0000,  8.0000, CURRENT_DATE,     CURRENT_DATE + 180,'Frijoles El Rey',        5000.00),

    -- Lechuga romana (vida muy corta)
    ('d0ead0f0-4100-0000-0000-000000000018', v_tenant, i_lechuga,
      2.0000,  2.0000, CURRENT_DATE - 1, CURRENT_DATE + 3,  'Frutas y Verduras HD',   4200.00),
    ('d0ead0f0-4100-0000-0000-000000000019', v_tenant, i_lechuga,
      3.0000,  3.0000, CURRENT_DATE,     CURRENT_DATE + 5,  'Frutas y Verduras HD',   4000.00),

    -- Tomate chonto
    ('d0ead0f0-4100-0000-0000-000000000020', v_tenant, i_tomate,
      2.0000,  2.0000, CURRENT_DATE - 1, CURRENT_DATE + 4,  'Frutas y Verduras HD',   3500.00),
    ('d0ead0f0-4100-0000-0000-000000000021', v_tenant, i_tomate,
      3.0000,  3.0000, CURRENT_DATE,     CURRENT_DATE + 6,  'Frutas y Verduras HD',   3300.00),

    -- Café molido especial
    ('d0ead0f0-4100-0000-0000-000000000022', v_tenant, i_cafe,
      1.0000,  1.0000, CURRENT_DATE - 5, CURRENT_DATE + 85, 'Café de Colombia',      45000.00),
    ('d0ead0f0-4100-0000-0000-000000000023', v_tenant, i_cafe,
      2.0000,  2.0000, CURRENT_DATE - 1, CURRENT_DATE + 90, 'Café de Colombia',      44000.00),

    -- Jugo de naranja (natural, vida corta)
    ('d0ead0f0-4100-0000-0000-000000000024', v_tenant, i_jugo_nrj,
      5.0000,  5.0000, CURRENT_DATE - 1, CURRENT_DATE + 4,  'Frutas y Verduras HD',   4500.00),
    ('d0ead0f0-4100-0000-0000-000000000025', v_tenant, i_jugo_nrj,
      8.0000,  8.0000, CURRENT_DATE,     CURRENT_DATE + 5,  'Frutas y Verduras HD',   4200.00),

    -- Agua con gas 750ml
    ('d0ead0f0-4100-0000-0000-000000000026', v_tenant, i_agua_gas,
     24.0000, 24.0000, CURRENT_DATE - 3, CURRENT_DATE + 177,'Agua Manantial',         2800.00),

    -- Pan artesanal (vence en 2 días)
    ('d0ead0f0-4100-0000-0000-000000000027', v_tenant, i_pan_art,
     20.0000, 20.0000, CURRENT_DATE,     CURRENT_DATE + 2,  'Panadería Central',      1800.00),

    -- Pandebono — capa_2: stock producido en turno anterior
    ('d0ead0f0-4200-0000-0000-000000000001', v_tenant, i_pandebono,
     24.0000, 24.0000, CURRENT_DATE,     CURRENT_DATE + 1,  NULL, NULL),

    -- Ensalada mixta — capa_2: preparada en turno anterior
    ('d0ead0f0-4200-0000-0000-000000000002', v_tenant, i_ensalada,
      8.0000,  8.0000, CURRENT_DATE,     CURRENT_DATE + 1,  NULL, NULL)

  ) AS v(id, tenant_id, insumo_id, cantidad_inicial, cantidad_actual,
         fecha_recibido, fecha_vencimiento, proveedor, costo_unitario)
  ON CONFLICT (id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 6. MOVIMIENTOS DE ENTRADA (ledger inicial del inventario)
  -- Solo inserta si el lote aún no tiene un movimiento de entrada.
  -- Esto hace el bloque idempotente sin necesidad de IDs fijos.
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.movimientos_inventario (
    id, tenant_id, insumo_id, lote_id, tipo, cantidad, usuario_id
  )
  SELECT
    gen_random_uuid(),
    l.tenant_id,
    l.insumo_id,
    l.id,
    'entrada',
    l.cantidad_inicial,
    u_admin
  FROM public.lotes l
  WHERE l.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1
      FROM public.movimientos_inventario m
      WHERE m.lote_id = l.id
        AND m.tipo = 'entrada'
    );

  -- ──────────────────────────────────────────────────────────────────────────
  -- 7. RECETAS DE PRODUCCIÓN (capa_1 → capa_2)
  -- ──────────────────────────────────────────────────────────────────────────
  -- rendimiento_cantidad es obligatorio en las recetas de producción desde
  -- F-037 (20260824000002): la restricción recetas_produccion_tiene_rendimiento
  -- las rechaza sin él. Se usa el mismo valor que `porciones`, que es la regla
  -- que aplica el backfill de esa migración a las recetas ya existentes.
  INSERT INTO public.recetas (
    id, tenant_id, nombre, tipo_receta, insumo_destino_id, porciones, area_produccion,
    rendimiento_cantidad
  )
  VALUES
    (r_prod_pande, v_tenant,
     'Producción Pandebono', 'produccion', i_pandebono, 12, 'pasteleria', 12),
    (r_prod_ensa, v_tenant,
     'Producción Ensalada Mixta', 'produccion', i_ensalada, 4, 'cocina_fria', 4)
  ON CONFLICT (id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 8. RECETAS DE SERVICIO (capa_1/2 → zona)
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.recetas (
    id, tenant_id, nombre, tipo_receta,
    zona, porciones, area_produccion, categoria_menu, descripcion
  )
  VALUES
    -- Zona Amex — rutea a cocina_fria / amex / pasteleria (ZONA_AREAS_PERMITIDAS);
    -- lo caliente de amex lo produce el área 'amex' (cocina AMEX dedicada).
    (r_bandeja_ej, v_tenant, 'Bandeja Ejecutiva', 'servicio',
     'amex', 1, 'amex', 'plato_fuerte',
     'Pechuga de pollo a la plancha con arroz blanco, frijoles rojos y ensalada de la casa'),

    (r_ensalada_sv, v_tenant, 'Ensalada Fresca', 'servicio',
     'amex', 1, 'cocina_fria', 'entrada',
     'Ensalada mixta con tomate, aguacate y aderezo de la casa'),

    (r_jugo_nrj, v_tenant, 'Jugo de Naranja Natural', 'servicio',
     'amex', 1, 'cocina_fria', NULL,
     'Jugo de naranja recién exprimido, sin azúcar añadida'),

    -- Zona Snack
    (r_pandebono_2, v_tenant, 'Pandebono x2', 'servicio',
     'snack', 1, 'pasteleria', NULL, NULL),

    (r_cafe_am, v_tenant, 'Café Americano', 'servicio',
     'snack', 1, 'cocina_caliente', NULL, NULL),

    -- Zona Buffet
    (r_buffet, v_tenant, 'Servicio Buffet Completo', 'servicio',
     'buffet', 1, 'cocina_caliente', NULL, NULL)

  ON CONFLICT (id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 9. INGREDIENTES POR RECETA
  -- cantidad = cantidad requerida por porción (antes de aplicar merma).
  -- El descuento real = cantidad / (1 - merma_coeficiente) — calculado por el RPC.
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO public.receta_ingredientes
    (tenant_id, receta_id, insumo_id, cantidad, merma_coeficiente)
  VALUES
    -- Producción Pandebono (por cada tanda de 12 unidades)
    (v_tenant, r_prod_pande, i_harina,  0.5000, 0.0500),  -- 526g descontados
    (v_tenant, r_prod_pande, i_queso,   0.3000, 0.0300),  -- 309g descontados
    (v_tenant, r_prod_pande, i_huevos,  2.0000, 0.0200),  -- 2.04 unidades descontadas
    (v_tenant, r_prod_pande, i_leche,   0.1000, 0.0200),  -- 102ml descontados

    -- Producción Ensalada Mixta (por cada tanda de 4 porciones)
    (v_tenant, r_prod_ensa,  i_lechuga, 0.3000, 0.1500),  -- 353g descontados
    (v_tenant, r_prod_ensa,  i_tomate,  0.2000, 0.1000),  -- 222g descontados

    -- Bandeja Ejecutiva (por porción)
    (v_tenant, r_bandeja_ej, i_pollo,    0.2000, 0.1000), -- 222g descontados
    (v_tenant, r_bandeja_ej, i_arroz,    0.1500, 0.0500), -- 158g descontados
    (v_tenant, r_bandeja_ej, i_frijoles, 0.1000, 0.0300), -- 103g descontados
    (v_tenant, r_bandeja_ej, i_aceite,   0.0200, 0.0200), -- 20ml descontados

    -- Ensalada Fresca (por porción, usa capa_2 ya preparada)
    (v_tenant, r_ensalada_sv, i_ensalada, 1.0000, 0.0000),

    -- Jugo de Naranja (por vaso de 250ml)
    (v_tenant, r_jugo_nrj, i_jugo_nrj, 0.2500, 0.0500),  -- 263ml descontados

    -- Pandebono x2 (usa capa_2 ya producida)
    (v_tenant, r_pandebono_2, i_pandebono, 2.0000, 0.0000),

    -- Café Americano (10g de café molido por taza)
    (v_tenant, r_cafe_am, i_cafe, 0.0100, 0.0500),        -- 10.5g descontados

    -- Servicio Buffet Completo (por comensal, mezcla capa_1 y capa_2)
    (v_tenant, r_buffet, i_arroz,     0.2000, 0.0500),
    (v_tenant, r_buffet, i_frijoles,  0.1500, 0.0300),
    (v_tenant, r_buffet, i_carne_res, 0.1500, 0.1200),    -- carne tiene más merma
    (v_tenant, r_buffet, i_ensalada,  1.0000, 0.0000),
    (v_tenant, r_buffet, i_pandebono, 1.0000, 0.0000)

  ON CONFLICT (receta_id, insumo_id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 10. TURNO ACTIVO
  -- ──────────────────────────────────────────────────────────────────────────
  -- Bloques fijos de 8h (20260522000001): turnos vivos requieren bloque y la
  -- app inserta nombre = bloque. Misma convención aquí.
  INSERT INTO public.turnos (id, tenant_id, nombre, bloque, teamlider, responsable_id, iniciado_at, activo)
  VALUES (
    v_turno, v_tenant,
    '6a2',
    '6a2',
    'Ana García',
    u_admin,
    (CURRENT_DATE + time '06:00:00')::timestamptz,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 11. PEDIDOS DE MUESTRA (para probar el KDS desde el primer arranque)
  -- ──────────────────────────────────────────────────────────────────────────

  -- Pedido 1: recién creado, esperando en KDS (estado: creado)
  INSERT INTO public.pedidos (
    id, tenant_id, turno_id, numero_mesa, responsable_id,
    estado, zona, idempotency_key
  )
  VALUES (
    v_pedido_1, v_tenant, v_turno, 'Mesa 5', u_amex,
    'creado', 'amex', 'seed:pedido:mesa5:turno-a'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pedido_items (tenant_id, pedido_id, receta_id, cantidad, area_produccion)
  VALUES
    (v_tenant, v_pedido_1, r_bandeja_ej,  2, 'amex'),
    (v_tenant, v_pedido_1, r_jugo_nrj,    2, 'cocina_fria')
  ON CONFLICT DO NOTHING;

  -- Pedido 2: en preparación (estado: en_preparacion)
  INSERT INTO public.pedidos (
    id, tenant_id, turno_id, numero_mesa, responsable_id,
    estado, zona, idempotency_key
  )
  VALUES (
    v_pedido_2, v_tenant, v_turno, 'Mesa 3', u_amex,
    'en_preparacion', 'amex', 'seed:pedido:mesa3:turno-a'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pedido_items (tenant_id, pedido_id, receta_id, cantidad, area_produccion)
  VALUES
    (v_tenant, v_pedido_2, r_bandeja_ej,  1, 'amex'),
    (v_tenant, v_pedido_2, r_ensalada_sv, 1, 'cocina_fria'),
    (v_tenant, v_pedido_2, r_jugo_nrj,    1, 'cocina_fria')
  ON CONFLICT DO NOTHING;

  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '✓ Seed completado para tenant: GISAT S.A. — Dorado Lounge';
  RAISE NOTICE '  Usuarios  : superuser | admin | chef | soschef | amex | snack | buffet';
  RAISE NOTICE '  Contraseña: DoradoTest2024!';
  RAISE NOTICE '  Insumos   : 15 capa_1 + 2 capa_2';
  RAISE NOTICE '  Lotes     : 29 (con fechas FEFO variadas)';
  RAISE NOTICE '  Recetas   : 2 producción + 6 servicio (amex/snack/buffet)';
  RAISE NOTICE '  Turno     : bloque 6a2 activo desde las 06:00';
  RAISE NOTICE '  Pedidos   : 2 pedidos en KDS (Mesa 5 creado, Mesa 3 en preparacion)';

END $$;

-- =============================================================================
-- Bloque adicional — Usuarios para los 4 roles operativos extendidos
-- (introducidos por la migración 20260512000000_extend_user_roles)
-- Se ejecuta como bloque independiente para mantener idempotencia separada.
-- =============================================================================
DO $$
DECLARE
  v_tenant     uuid := 'd0ead0f0-1000-0000-0000-000000000001';
  v_pwd_hash   text;

  u_recepcion  uuid := 'd0ead0f0-2000-0000-0000-000000000008';
  u_almacen    uuid := 'd0ead0f0-2000-0000-0000-000000000009';
  u_pasteleria uuid := 'd0ead0f0-2000-0000-0000-00000000000a';
  u_steward    uuid := 'd0ead0f0-2000-0000-0000-00000000000b';
BEGIN
  v_pwd_hash := crypt('DoradoTest2024!', gen_salt('bf'));

  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at
  )
  VALUES
    (u_recepcion, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'recepcion@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'recepcion'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'recepcion'),
     now(), now()),

    (u_almacen, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'almacen@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_almacen'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_almacen'),
     now(), now()),

    (u_pasteleria, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'pasteleria@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_pasteleria'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'personal_pasteleria'),
     now(), now()),

    (u_steward, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'steward@doradolounge.dev', v_pwd_hash, now(),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'steward'),
     jsonb_build_object('tenant_id', v_tenant::text, 'role', 'steward'),
     now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, tenant_id, nombre, role, activo)
  VALUES
    (u_recepcion,  v_tenant, 'Recepción Lounge',        'recepcion',           true),
    (u_almacen,    v_tenant, 'Personal de Almacén',     'personal_almacen',    true),
    (u_pasteleria, v_tenant, 'Personal de Pastelería',  'personal_pasteleria', true),
    (u_steward,    v_tenant, 'Steward (Utensilios)',    'steward',             true)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Seed extendido: 4 usuarios para roles operativos adicionales';
  RAISE NOTICE '  recepcion@ | almacen@ | pasteleria@ | steward@ @doradolounge.dev';
END $$;
