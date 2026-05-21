import type { AnalyticsRepository } from './ports/analytics-repository.port';
import type { ConsumoInsumo, AnalyticsFilters } from '../domain/kpi';

export async function getConsumoVsProduccion(
  repo: AnalyticsRepository,
  tenantId: string | null,
  filters: AnalyticsFilters,
): Promise<ConsumoInsumo[]> {
  return repo.getConsumoVsProduccion(tenantId, filters);
}
