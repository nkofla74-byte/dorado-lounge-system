import type { CogsPerPassenger, ConsumoInsumo, AnalyticsFilters } from '../../domain/kpi';

export interface AnalyticsRepository {
  getCogsPerPassenger(tenantId: string, filters: AnalyticsFilters): Promise<CogsPerPassenger[]>;
  getConsumoVsProduccion(tenantId: string, filters: AnalyticsFilters): Promise<ConsumoInsumo[]>;
}
