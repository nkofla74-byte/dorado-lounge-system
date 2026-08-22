-- F-005 (RC-3): las vistas materializadas se crearon WITH NO DATA y
-- refresh_analytics_views solo hacía REFRESH ... CONCURRENTLY, que PostgreSQL
-- rechaza sobre una vista no poblada. La RPC fallaba siempre.
DO $$
BEGIN
  PERFORM test.assert(
    test.expect_error('SELECT public.refresh_analytics_views()') IS NULL,
    'refresh_analytics_views sigue fallando');
END $$;

-- Debe poder llamarse dos veces seguidas (la segunda ya usa CONCURRENTLY).
DO $$
BEGIN
  PERFORM public.refresh_analytics_views();
  PERFORM public.refresh_analytics_views();
END $$;

-- Y las vistas quedan pobladas, no solo definidas.
DO $$
DECLARE v_poblada boolean;
BEGIN
  SELECT ispopulated INTO v_poblada
  FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_consumo_vs_produccion_turno';
  PERFORM test.assert(v_poblada, 'mv_consumo_vs_produccion_turno sigue sin poblar');

  -- mv_cogs_per_passenger se eliminó al retirar vuelos/afluencia
  -- (20260613000000); refresh_analytics_views debe tolerar su ausencia en lugar
  -- de fallar, y así lo verifica el primer bloque de esta prueba.
  PERFORM test.assert(
    NOT EXISTS (SELECT 1 FROM pg_matviews
                WHERE schemaname = 'public' AND matviewname = 'mv_cogs_per_passenger'),
    'mv_cogs_per_passenger reapareció: revisar el contrato de refresh_analytics_views');
END $$;

-- Sigue sin ser ejecutable por roles de aplicación.
DO $$
BEGIN
  PERFORM test.assert(
    NOT has_function_privilege('authenticated', 'public.refresh_analytics_views()', 'EXECUTE'),
    'authenticated puede refrescar las vistas materializadas');
END $$;

-- Regresión directa del defecto: sobre una vista sin poblar, el refresco
-- concurrente a secas falla; la función corregida debe salir adelante.
DO $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_consumo_vs_produccion_turno WITH NO DATA;

  PERFORM test.assert(
    test.expect_error(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_consumo_vs_produccion_turno') = '0A000',
    'se esperaba que el refresco concurrente fallara sobre una vista sin poblar');

  PERFORM test.assert(
    test.expect_error('SELECT public.refresh_analytics_views()') IS NULL,
    'refresh_analytics_views no se recupera de una vista sin poblar');

  PERFORM test.assert(
    (SELECT ispopulated FROM pg_matviews
      WHERE schemaname = 'public' AND matviewname = 'mv_consumo_vs_produccion_turno'),
    'la vista quedó sin poblar tras el refresco');
END $$;
