-- F-006 (RC-2): los roles de cocina vigentes tienen production:write en la app.
-- La RLS de tandas_produccion debe concederles la escritura; hoy solo contempla
-- roles del modelo anterior ('chef', deprecado) y los deja fuera.

-- Receta de producción sobre la que se elaboran las tandas.
-- rendimiento_cantidad es obligatorio en recetas de producción desde F-037.
INSERT INTO public.recetas (id, tenant_id, nombre, tipo_receta, porciones, area_produccion, insumo_destino_id, rendimiento_cantidad)
VALUES ('eeeeeeee-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111', 'Base fría', 'produccion', 10, 'cocina_fria',
        'cccccccc-0000-0000-0000-000000000002', 10);

DO $$
DECLARE
  v_usuario uuid;
  v_usuarios uuid[] := ARRAY[
    'aaaaaaaa-0000-0000-0000-000000000003',  -- chef_cocina_fria
    'aaaaaaaa-0000-0000-0000-000000000004',  -- chef_cocina_caliente
    'aaaaaaaa-0000-0000-0000-000000000006'   -- personal_pasteleria
  ]::uuid[];
  v_sql text;
BEGIN
  FOREACH v_usuario IN ARRAY v_usuarios LOOP
    PERFORM test.login(v_usuario);

    v_sql := format(
      'INSERT INTO public.tandas_produccion '
      '(tenant_id, receta_id, cantidad_tandas, responsable_id, idempotency_key, zona_destino) '
      'VALUES (%L, %L, 1, %L, %L, %L)',
      '11111111-1111-1111-1111-111111111111',
      'eeeeeeee-0000-0000-0000-000000000003',
      v_usuario, 'tanda-' || v_usuario, 'amex');

    PERFORM test.assert(
      test.exec_count(v_sql) = 1,
      format('el usuario %s no pudo crear una tanda pese a tener production:write', v_usuario));

    PERFORM test.logout();
  END LOOP;
END $$;

-- Un rol sin production:write no debe poder crear tandas.
DO $$
DECLARE v_sql text;
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- mesero_amex

  v_sql := format(
    'INSERT INTO public.tandas_produccion '
    '(tenant_id, receta_id, cantidad_tandas, responsable_id, idempotency_key, zona_destino) '
    'VALUES (%L, %L, 1, %L, %L, %L)',
    '11111111-1111-1111-1111-111111111111',
    'eeeeeeee-0000-0000-0000-000000000003',
    'aaaaaaaa-0000-0000-0000-000000000002', 'tanda-mesero', 'amex');

  PERFORM test.assert(
    test.exec_count(v_sql) <= 0,
    'un mesero_amex pudo crear una tanda de producción');

  PERFORM test.logout();
END $$;

-- El camino realmente roto era el UPDATE: `USING` sí llevaba el predicado de rol,
-- así que los chefs podían crear la tanda pero no iniciarla, completarla ni
-- cancelarla (production/actions.ts -> repo.updateEstado usa el cliente RLS).
DO $$
DECLARE v_tanda uuid := '12121212-0000-0000-0000-00000000000a';
BEGIN
  INSERT INTO public.tandas_produccion
    (id, tenant_id, receta_id, cantidad_tandas, responsable_id, idempotency_key, zona_destino)
  VALUES (v_tanda, '11111111-1111-1111-1111-111111111111',
          'eeeeeeee-0000-0000-0000-000000000003', 1,
          'aaaaaaaa-0000-0000-0000-000000000003', 'tanda-update', 'amex');

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000003');  -- chef_cocina_fria
  PERFORM test.assert(
    test.exec_count(format(
      'UPDATE public.tandas_produccion SET estado = %L WHERE id = %L',
      'en_proceso', v_tanda)) = 1,
    'chef_cocina_fria no pudo iniciar una tanda pese a tener production:write');
  PERFORM test.logout();

  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- mesero_amex
  PERFORM test.assert(
    test.exec_count(format(
      'UPDATE public.tandas_produccion SET estado = %L WHERE id = %L',
      'cancelada', v_tanda)) <= 0,
    'un mesero_amex pudo cambiar el estado de una tanda');
  PERFORM test.logout();
END $$;
