-- =============================================================================
-- 20260528000001_area_produccion_split.sql
-- Refoco operacional — divide el área productiva `cocina` en `cocina_caliente`
-- y `cocina_fria`, para soportar los 4 KDS (caliente / fría / pastelería / amex)
-- y el ruteo zona→área.
--
-- `cocina` queda INERTE (Postgres no permite DROP VALUE de un enum sin recrear
-- el tipo). Las recetas previas etiquetadas como 'cocina' se reclasifican
-- manualmente a caliente/fría; los nuevos valores son los productivos.
--
-- Idempotente (ADD VALUE IF NOT EXISTS). Sin BEGIN/COMMIT: ADD VALUE no puede
-- usarse dentro de la misma transacción en que se crea.
-- =============================================================================

ALTER TYPE public.area_produccion ADD VALUE IF NOT EXISTS 'cocina_caliente';
ALTER TYPE public.area_produccion ADD VALUE IF NOT EXISTS 'cocina_fria';
