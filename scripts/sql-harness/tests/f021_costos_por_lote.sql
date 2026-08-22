-- F-021: getCostosRecetas lanzaba una RPC por receta. fn_costo_recetas resuelve
-- el lote completo en una llamada, reutilizando fn_costo_receta (una sola
-- definición del costeo y un solo guard de tenant).
DO $$
DECLARE v_res jsonb;
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000001');  -- admin
  v_res := public.fn_costo_recetas(
    '11111111-1111-1111-1111-111111111111',
    ARRAY['eeeeeeee-0000-0000-0000-000000000001',
          'eeeeeeee-0000-0000-0000-000000000002']::uuid[]);
  PERFORM test.logout();

  PERFORM test.assert(v_res ? 'eeeeeeee-0000-0000-0000-000000000001',
    'falta el costo de la primera receta');
  PERFORM test.assert(v_res ? 'eeeeeeee-0000-0000-0000-000000000002',
    'falta el costo de la segunda receta');
END $$;

-- Conserva el guard de tenant de fn_costo_receta: nada de otro tenant.
DO $$
DECLARE v_res jsonb;
BEGIN
  PERFORM test.login('bbbbbbbb-0000-0000-0000-000000000001');  -- admin del tenant 2
  v_res := public.fn_costo_recetas(
    '11111111-1111-1111-1111-111111111111',
    ARRAY['eeeeeeee-0000-0000-0000-000000000001']::uuid[]);
  PERFORM test.logout();

  PERFORM test.assert(v_res = '{}'::jsonb,
    'se filtraron costos de otro tenant: ' || v_res::text);
END $$;

-- Lista vacía y receta inexistente no rompen.
DO $$
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000001');
  PERFORM test.assert(
    public.fn_costo_recetas('11111111-1111-1111-1111-111111111111', ARRAY[]::uuid[]) = '{}'::jsonb,
    'la lista vacía debería devolver un objeto vacío');
  PERFORM test.assert(
    public.fn_costo_recetas('11111111-1111-1111-1111-111111111111',
      ARRAY['00000000-0000-0000-0000-0000000000aa']::uuid[]) = '{}'::jsonb,
    'una receta inexistente no debería aparecer en el resultado');
  PERFORM test.logout();
END $$;
