-- ──────────────────────────────────────────────────────────────────────────────
-- 20260522000001_turnos_bloques_fijos
-- Turnos — bloques fijos de 8h: 6a2, 2a10, 10a6. Inmutables a nivel de sistema.
--
-- Antes: turnos.nombre era texto libre.
-- Ahora: nuevo enum turno_bloque + columna bloque + check constraint.
-- nombre se mantiene NOT NULL pero la app pone nombre = bloque al insertar.
-- Soft delete vía deleted_at para preservar historial (62 filas hijas con FK).
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Cerrar turno activo si existe (lleva 9 días abierto en remoto).
UPDATE public.turnos
SET cerrado_at = now(),
    activo = false,
    updated_at = now()
WHERE activo = true;

-- 2. Normalizar nombres legacy a la nomenclatura nueva.
UPDATE public.turnos SET nombre = '6a2', updated_at = now() WHERE nombre = '6-2';
UPDATE public.turnos SET nombre = '10a6', updated_at = now() WHERE nombre = '10-6';

-- 3. Enum de bloques fijos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turno_bloque') THEN
    CREATE TYPE public.turno_bloque AS ENUM ('6a2', '2a10', '10a6');
  END IF;
END $$;

-- 4. Columnas nuevas.
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS bloque    public.turno_bloque NULL;

-- 5. Backfill bloque desde nombre normalizado (los 2 legacy quedan mapeados).
UPDATE public.turnos
SET bloque = nombre::public.turno_bloque
WHERE bloque IS NULL
  AND nombre IN ('6a2', '2a10', '10a6');

-- 6. Soft-delete histórico: los turnos legacy quedan archivados. Las 62 filas
--    hijas (afluencia_ingresos, tandas_produccion, mermas, etc.) conservan FK
--    válida; la app filtrará WHERE deleted_at IS NULL en queries operacionales.
UPDATE public.turnos
SET deleted_at = now(),
    updated_at = now()
WHERE deleted_at IS NULL;

-- 7. Constraint: turnos vivos (no soft-deleted) deben tener bloque.
ALTER TABLE public.turnos
  DROP CONSTRAINT IF EXISTS chk_turnos_bloque_required;
ALTER TABLE public.turnos
  ADD CONSTRAINT chk_turnos_bloque_required
  CHECK (deleted_at IS NOT NULL OR bloque IS NOT NULL);

-- 8. Índice para queries operacionales que filtran soft-delete.
CREATE INDEX IF NOT EXISTS idx_turnos_tenant_activo_vivo
  ON public.turnos(tenant_id, activo)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.turnos.bloque IS
  'Bloque fijo del turno (6a2=06:00–14:00, 2a10=14:00–22:00, 10a6=22:00–06:00). NULL solo en filas previas a esta migración (soft-deleted).';
COMMENT ON COLUMN public.turnos.deleted_at IS
  'Soft delete. Filas con deleted_at IS NOT NULL son históricas (no operativas) y se ignoran en queries de turno activo.';
