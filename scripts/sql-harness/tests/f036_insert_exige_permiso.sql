-- F-036 (RC-1): el `WITH CHECK` de las políticas `FOR ALL` solo validaba
-- tenant_id. Como `USING` no aplica al INSERT, cualquier rol autenticado podía
-- insertar en tablas de inventario y recetario. Inyectar lotes con stock
-- fantasma viola el Principio Rector sin pasar por ninguna receta.
DO $$
DECLARE v_sql text;
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- mesero_amex: sin inventory:write

  v_sql := format(
    'INSERT INTO public.lotes (tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual) '
    'VALUES (%L, %L, %L, 999, 999)',
    '11111111-1111-1111-1111-111111111111',
    'cccccccc-0000-0000-0000-000000000001', 'LOT-FANTASMA');
  PERFORM test.assert(test.exec_count(v_sql) <= 0,
    'un mesero_amex insertó un lote (stock fantasma)');

  v_sql := format(
    'INSERT INTO public.insumos (tenant_id, nombre, codigo, unidad_medida) VALUES (%L, %L, %L, %L)',
    '11111111-1111-1111-1111-111111111111', 'Insumo pirata', 'INS-PIRATA', 'g');
  PERFORM test.assert(test.exec_count(v_sql) <= 0, 'un mesero_amex insertó un insumo');

  v_sql := format(
    'INSERT INTO public.recetas (tenant_id, nombre, tipo_receta, porciones, zona) '
    'VALUES (%L, %L, %L, 1, %L)',
    '11111111-1111-1111-1111-111111111111', 'Receta pirata', 'servicio', 'amex');
  PERFORM test.assert(test.exec_count(v_sql) <= 0, 'un mesero_amex insertó una receta');

  v_sql := format(
    'INSERT INTO public.proveedores (tenant_id, nombre) VALUES (%L, %L)',
    '11111111-1111-1111-1111-111111111111', 'Proveedor pirata');
  PERFORM test.assert(test.exec_count(v_sql) <= 0, 'un mesero_amex insertó un proveedor');

  PERFORM test.logout();
END $$;

-- El rol con el permiso sí debe poder: la corrección no puede romper el flujo real.
DO $$
DECLARE v_sql text;
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000005');  -- personal_almacen: inventory:write

  v_sql := format(
    'INSERT INTO public.lotes (tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual) '
    'VALUES (%L, %L, %L, 500, 500)',
    '11111111-1111-1111-1111-111111111111',
    'cccccccc-0000-0000-0000-000000000001', 'LOT-LEGITIMO');
  PERFORM test.assert(test.exec_count(v_sql) = 1,
    'personal_almacen no pudo registrar un lote pese a tener inventory:write');

  PERFORM test.logout();
END $$;

-- Y nunca a través de un tenant ajeno.
DO $$
DECLARE v_sql text;
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000005');  -- personal_almacen del tenant 1

  v_sql := format(
    'INSERT INTO public.proveedores (tenant_id, nombre) VALUES (%L, %L)',
    '22222222-2222-2222-2222-222222222222', 'Cross-tenant');
  PERFORM test.assert(test.exec_count(v_sql) <= 0,
    'se insertó una fila en un tenant ajeno');

  PERFORM test.logout();
END $$;
