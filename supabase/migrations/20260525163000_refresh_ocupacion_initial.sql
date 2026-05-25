-- Función de fallback para el primer refresh de la vista materializada.
-- CONCURRENTLY requiere que la vista ya tenga datos (UNIQUE INDEX populated).
-- Esta función hace el refresh sin CONCURRENTLY para la primera carga.

CREATE OR REPLACE FUNCTION public.refresh_ocupacion_diaria_initial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_ocupacion_diaria;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_ocupacion_diaria_initial FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_ocupacion_diaria_initial TO service_role;
