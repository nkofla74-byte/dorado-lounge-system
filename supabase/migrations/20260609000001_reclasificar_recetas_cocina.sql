-- =============================================================================
-- 20260609000001_reclasificar_recetas_cocina.sql
-- Reclasifica recetas legacy del área inerte 'cocina' a 'cocina_caliente'
-- (default operativo; el admin reclasifica finamente desde /recetas).
-- Sin esto, una receta 'cocina' es irruteable: ZONA_AREAS_PERMITIDAS no la
-- incluye y createPedido la rechaza. Idempotente (segunda corrida = 0 filas).
-- Debe correr DESPUÉS de 20260528000001 (ADD VALUE no es usable en la misma
-- transacción en que se crea — por eso va en archivo separado).
-- =============================================================================

UPDATE public.recetas
SET area_produccion = 'cocina_caliente'
WHERE area_produccion = 'cocina';
