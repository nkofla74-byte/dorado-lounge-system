import type { ConsumoInsumo, AnalyticsFilters } from '../../domain/kpi';

// tenantId=null → vista global (sin filtro de tenant), solo para superuser.
// La validación de rol ocurre en la action.
export interface AnalyticsRepository {
  getConsumoVsProduccion(
    tenantId: string | null,
    filters: AnalyticsFilters,
  ): Promise<ConsumoInsumo[]>;
}
