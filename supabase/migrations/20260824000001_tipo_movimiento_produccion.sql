-- =============================================================================
-- 20260824000001_tipo_movimiento_produccion.sql
--
-- HALLAZGO F-037 — parte 1 de 3.
--
-- El ledger no tenía forma de nombrar una entrada por producción propia. El
-- único valor de entrada era 'entrada', documentado como «compra / recepción de
-- proveedor». Reutilizarlo habría mezclado en la misma categoría lo que se
-- compra y lo que se elabora, y la analítica de consumo no podría separarlas.
--
-- Va en su propia migración porque PostgreSQL no permite USAR un valor de enum
-- en la misma transacción en la que se añade. La migración 20260824000003 es la
-- que lo usa.
-- =============================================================================

ALTER TYPE public.tipo_movimiento ADD VALUE IF NOT EXISTS 'produccion';

-- =============================================================================
-- ROLLBACK (manual): PostgreSQL no permite eliminar un valor de un enum. Para
-- revertir habría que recrear el tipo y todas sus columnas. No se revierte:
-- el valor sobrante es inerte si nadie lo escribe.
-- =============================================================================
