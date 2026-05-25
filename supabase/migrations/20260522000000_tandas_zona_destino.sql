-- ──────────────────────────────────────────────────────────────────────────────
-- 20260522000000_tandas_zona_destino
-- Tandas de producción — zona destino de la elaboración (AMEX / Snack / Buffet).
--
-- Pastelería (y cualquier área de producción) elige al crear la tanda hacia
-- qué zona de servicio se prepara. Trazabilidad: una tanda → una zona.
-- Si una elaboración va a varias zonas, se crean varias tandas.
--
-- Nullable: filas existentes (legacy) quedan en NULL. La validación
-- "obligatorio al crear" la enforza el schema Zod en la capa de app.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tandas_produccion
  ADD COLUMN IF NOT EXISTS zona_destino public.zona_servicio NULL;

COMMENT ON COLUMN public.tandas_produccion.zona_destino IS
  'Zona de servicio a la que se destina la elaboración. NULL solo en tandas previas a esta migración; nuevas tandas lo requieren vía schema Zod.';
