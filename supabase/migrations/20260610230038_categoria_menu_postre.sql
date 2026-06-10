-- =============================================================================
-- 20260610230038_categoria_menu_postre.sql
-- Recetario oficial AMEX — la carta incluye postres (flan, cocadas, enyucado)
-- y el enum categoria_menu solo tenía entrada/plato_fuerte/acompanante.
--
-- Nota: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción
-- que luego use el valor nuevo; por eso esta migración no abre BEGIN/COMMIT
-- (mismo patrón que 20260528000001_area_produccion_split.sql).
-- Ver spec: docs/superpowers/specs/2026-06-10-recetario-amex-design.md
-- =============================================================================

ALTER TYPE public.categoria_menu ADD VALUE IF NOT EXISTS 'postre';

COMMENT ON COLUMN public.recetas.categoria_menu IS
  'Sección del menú público: entrada, plato_fuerte, acompanante o postre. Nullable = no aparece en menú QR.';

-- =============================================================================
-- ROLLBACK: los valores de enum no se pueden eliminar en PostgreSQL sin
-- recrear el tipo. Para revertir: dejar de usar ''postre'' en recetas
-- (UPDATE recetas SET categoria_menu = NULL WHERE categoria_menu = 'postre').
-- =============================================================================
