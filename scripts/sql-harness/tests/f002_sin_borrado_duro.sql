-- F-002 (RC-1): el modelo usa borrado lógico (deleted_at). Ningún rol de
-- aplicación puede ejecutar DELETE físico sobre tablas operativas.
DO $$
DECLARE
  v_tabla text;
  v_tablas text[] := ARRAY[
    'pedidos', 'pedido_items', 'lotes', 'insumos', 'recetas',
    'receta_ingredientes', 'tandas_produccion', 'despachos', 'turnos',
    'proveedores', 'requisiciones', 'requisicion_items', 'mermas',
    'movimientos_inventario'];
  v_usuario uuid;
  v_usuarios uuid[] := ARRAY[
    'aaaaaaaa-0000-0000-0000-000000000001',  -- admin
    'aaaaaaaa-0000-0000-0000-000000000002',  -- mesero_amex
    'aaaaaaaa-0000-0000-0000-000000000005'   -- personal_almacen
  ]::uuid[];
BEGIN
  FOREACH v_usuario IN ARRAY v_usuarios LOOP
    PERFORM test.login(v_usuario);
    FOREACH v_tabla IN ARRAY v_tablas LOOP
      PERFORM test.assert(
        test.exec_count(format('DELETE FROM public.%I', v_tabla)) = -1,
        format('DELETE sobre %s no fue denegado por privilegio para el usuario %s',
               v_tabla, v_usuario));
    END LOOP;
    PERFORM test.logout();
  END LOOP;
END $$;
