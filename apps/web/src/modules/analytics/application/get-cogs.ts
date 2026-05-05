import type { AnalyticsRepository } from './ports/analytics-repository.port';
import type { CogsPerPassenger, AnalyticsFilters } from '../domain/kpi';

export async function getCogsPerPassenger(
  repo: AnalyticsRepository,
  tenantId: string,
  filters: AnalyticsFilters,
): Promise<CogsPerPassenger[]> {
  return repo.getCogsPerPassenger(tenantId, filters);
}
