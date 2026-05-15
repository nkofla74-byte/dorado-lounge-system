import type { CostoReceta } from '../../domain/costo';

export interface CostosRepository {
  getCostoReceta(tenantId: string, recetaId: string): Promise<CostoReceta | null>;
  getCostosRecetas(tenantId: string, recetaIds: string[]): Promise<Map<string, CostoReceta>>;
}
