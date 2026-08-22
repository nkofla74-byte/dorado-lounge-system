-- =============================================================================
-- Fixture determinista para las pruebas de RLS/RPC. Se carga con service_role
-- (bypass RLS) para representar el estado que crearía la aplicación.
-- Ids fijos para que las aserciones puedan referenciarlos.
-- =============================================================================
SET ROLE postgres;

-- Tenants
INSERT INTO public.tenants (id, nombre, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Dorado Lounge', 'dorado'),
  ('22222222-2222-2222-2222-222222222222', 'Otro Lounge',   'otro')
ON CONFLICT (id) DO NOTHING;

-- Usuarios auth + perfil. Los claims se fijan con el camino server-side
-- (fn_provisionar_claims_usuario), igual que hace la aplicación tras F-001.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@t1.test',    '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"admin"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'mesero@t1.test',   '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"mesero_amex"}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'fria@t1.test',     '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"chef_cocina_fria"}'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'caliente@t1.test', '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"chef_cocina_caliente"}'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'almacen@t1.test',  '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"personal_almacen"}'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'pastel@t1.test',   '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"personal_pasteleria"}'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'snack@t1.test',    '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"personal_snack"}'),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'sous@t1.test',     '{"tenant_id":"11111111-1111-1111-1111-111111111111","role":"sous_chef"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@t2.test',    '{"tenant_id":"22222222-2222-2222-2222-222222222222","role":"admin"}')
ON CONFLICT (id) DO NOTHING;

-- Claims de autorización: nunca derivados del signup (F-001).
DO $seed$
DECLARE u record;
BEGIN
  FOR u IN SELECT id, raw_user_meta_data AS meta FROM auth.users WHERE raw_user_meta_data ? 'role' LOOP
    PERFORM public.fn_provisionar_claims_usuario(
      u.id, (u.meta ->> 'tenant_id')::uuid, u.meta ->> 'role');
  END LOOP;
END $seed$;

INSERT INTO public.users (id, tenant_id, nombre, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Admin T1','admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Mesero T1','mesero_amex'),
  ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Chef Fria','chef_cocina_fria'),
  ('aaaaaaaa-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Chef Caliente','chef_cocina_caliente'),
  ('aaaaaaaa-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Almacen T1','personal_almacen'),
  ('aaaaaaaa-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Pasteleria T1','personal_pasteleria'),
  ('aaaaaaaa-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','Snack T1','personal_snack'),
  ('aaaaaaaa-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','Sous T1','sous_chef'),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Admin T2','admin')
ON CONFLICT (id) DO NOTHING;

-- Insumo con stock
INSERT INTO public.insumos (id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo, merma_default) VALUES
  ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Harina','INS-0001','capa_1','g',100,0),
  -- Insumo de capa 2: destino obligatorio de toda receta de producción.
  ('cccccccc-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Base fría elaborada','INS-0002','capa_2','g',0,0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lotes (id, tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual, fecha_vencimiento, costo_unitario) VALUES
  ('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-000000000001','LOT-0001',1000,1000, CURRENT_DATE + 30, 10)
ON CONFLICT (id) DO NOTHING;

-- Receta de servicio ruteada a cocina_fria, con un ingrediente
INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, porciones, area_produccion, categoria_menu, zona) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Ensalada','servicio',1,'cocina_fria','entrada','amex'),
  ('eeeeeeee-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Sopa','servicio',1,'cocina_caliente','plato_fuerte','amex')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.receta_ingredientes (tenant_id, receta_id, insumo_id, cantidad) VALUES
  ('11111111-1111-1111-1111-111111111111','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',50),
  ('11111111-1111-1111-1111-111111111111','eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001',80)
ON CONFLICT (receta_id, insumo_id) DO NOTHING;

-- Turno activo del mesero
INSERT INTO public.turnos (id, tenant_id, nombre, bloque, teamlider, responsable_id, activo) VALUES
  ('ffffffff-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','6a2','6a2','Jefe Turno','aaaaaaaa-0000-0000-0000-000000000002', true)
ON CONFLICT (id) DO NOTHING;

RESET ROLE;
