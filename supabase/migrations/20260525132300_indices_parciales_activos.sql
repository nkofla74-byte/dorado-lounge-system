-- Índices parciales para queries operativas frecuentes.
-- Todas las lecturas de inventario, recetas y lotes filtran por activo + soft delete.
-- Sin estos índices, Postgres hace full scan en las tablas completas.

CREATE INDEX IF NOT EXISTS idx_insumos_activos
  ON public.insumos(tenant_id)
  WHERE activo = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lotes_activos
  ON public.lotes(tenant_id, insumo_id)
  WHERE activo = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recetas_activas
  ON public.recetas(tenant_id)
  WHERE activo = true AND deleted_at IS NULL;

-- Pedidos activos: las queries de /pedidos y cocina AMEX filtran por estados no-terminales.
CREATE INDEX IF NOT EXISTS idx_pedidos_activos
  ON public.pedidos(tenant_id, zona, created_at)
  WHERE estado IN ('creado', 'recibido_cocina', 'en_preparacion', 'despachado')
    AND deleted_at IS NULL;

-- Alertas no leídas: deduplicación en cron y badge count en UI.
CREATE INDEX IF NOT EXISTS idx_alertas_no_leidas
  ON public.alertas(tenant_id, tipo, resource_id)
  WHERE leida = false;
