-- =============================================================================
-- 20260612120001_alerta_tipo_requisicion.sql
-- Frente 2 — amplía los CHECK de `alertas` para el tipo `requisicion_demora`
-- (requisición sin despachar > umbral) y el resource_tipo `requisicion`.
-- Los CHECK originales (migración 20260515000002) son inline → nombre
-- autogenerado `alertas_tipo_check` / `alertas_resource_tipo_check`.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas
  ADD CONSTRAINT alertas_tipo_check
  CHECK (tipo IN ('stock_minimo', 'vencimiento', 'cambio_precio', 'demora_amex', 'requisicion_demora'));

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_resource_tipo_check;
ALTER TABLE public.alertas
  ADD CONSTRAINT alertas_resource_tipo_check
  CHECK (resource_tipo IN ('insumo', 'lote', 'pedido', 'requisicion'));
