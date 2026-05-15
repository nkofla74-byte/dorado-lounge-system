import { createAdminClient } from '@/lib/supabase/admin';
import type { CostosRepository } from '../application/ports/costos-repository.port';
import type { CostoReceta, CostoIngrediente } from '../domain/costo';

function parseRpcRow(raw: Record<string, unknown>): CostoReceta {
  const ingredientes = (raw.ingredientes as unknown[]).map((item) => {
    const i = item as Record<string, unknown>;
    return {
      insumoId: i.insumo_id as string,
      insumoNombre: i.insumo_nombre as string,
      unidadMedida: i.unidad_medida as string,
      cantidad: Number(i.cantidad),
      mermaCoeficiente: Number(i.merma_coeficiente),
      cantidadBruta: Number(i.cantidad_bruta),
      precioUnitario: i.precio_unitario != null ? Number(i.precio_unitario) : null,
      costoIngrediente: i.costo_ingrediente != null ? Number(i.costo_ingrediente) : null,
    } satisfies CostoIngrediente;
  });

  return {
    recetaId: raw.receta_id as string,
    porciones: Number(raw.porciones),
    costoTotal: Number(raw.costo_total ?? 0),
    costoPorPorcion: raw.costo_por_porcion != null ? Number(raw.costo_por_porcion) : null,
    tieneCostoCompleto: raw.tiene_costo_completo as boolean,
    ingredientes,
  };
}

export function createCostosRepository(): CostosRepository {
  return {
    async getCostoReceta(tenantId, recetaId) {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc('fn_costo_receta', {
        p_tenant_id: tenantId,
        p_receta_id: recetaId,
      });
      if (error || !data || typeof data !== 'object' || 'error' in (data as object)) return null;
      return parseRpcRow(data as Record<string, unknown>);
    },

    async getCostosRecetas(tenantId, recetaIds) {
      if (recetaIds.length === 0) return new Map();
      const admin = createAdminClient();
      const settled = await Promise.allSettled(
        recetaIds.map((id) =>
          admin.rpc('fn_costo_receta', { p_tenant_id: tenantId, p_receta_id: id }),
        ),
      );
      const map = new Map<string, CostoReceta>();
      for (let i = 0; i < recetaIds.length; i++) {
        const result = settled[i];
        if (result?.status !== 'fulfilled') continue;
        const { data, error } = result.value;
        if (error || !data || typeof data !== 'object' || 'error' in (data as object)) continue;
        const costo = parseRpcRow(data as Record<string, unknown>);
        map.set(recetaIds[i]!, costo);
      }
      return map;
    },
  };
}
