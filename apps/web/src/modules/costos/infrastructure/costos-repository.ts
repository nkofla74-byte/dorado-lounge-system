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

      // Una sola llamada en vez de una RPC por receta. Con el catálogo real eran
      // decenas de round-trips simultáneos a Postgres desde una función
      // serverless, con riesgo de agotar el pool (F-021).
      const admin = createAdminClient();
      const { data, error } = await admin.rpc('fn_costo_recetas', {
        p_tenant_id: tenantId,
        p_receta_ids: recetaIds,
      });
      if (error || !data || typeof data !== 'object') return new Map();

      const map = new Map<string, CostoReceta>();
      for (const [recetaId, fila] of Object.entries(data as Record<string, unknown>)) {
        if (!fila || typeof fila !== 'object') continue;
        map.set(recetaId, costoRecetaFromRpcRow(fila as Record<string, unknown>));
      }
      return map;
    },
  };
}
