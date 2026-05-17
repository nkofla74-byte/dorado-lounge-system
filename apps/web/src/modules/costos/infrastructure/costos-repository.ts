import { createAdminClient } from '@/lib/supabase/admin';
import type { CostosRepository } from '../application/ports/costos-repository.port';
import type { CostoReceta } from '../domain/costo';
import { costoRecetaFromRpcRow } from '../domain/costo';

export function createCostosRepository(): CostosRepository {
  return {
    async getCostoReceta(tenantId, recetaId) {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc('fn_costo_receta', {
        p_tenant_id: tenantId,
        p_receta_id: recetaId,
      });
      if (error || !data || typeof data !== 'object' || 'error' in (data as object)) return null;
      return costoRecetaFromRpcRow(data as Record<string, unknown>);
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
        const costo = costoRecetaFromRpcRow(data as Record<string, unknown>);
        map.set(recetaIds[i]!, costo);
      }
      return map;
    },
  };
}
