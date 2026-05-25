import type { FlightsRepository } from './ports/flights-repository.port';
import { calculateForecast, type ForecastResult } from '../domain/forecast';

export async function getForecast(
  repo: FlightsRepository,
  tenantId: string,
  fecha: string,
): Promise<ForecastResult> {
  const departures = await repo.getDeparturesForDate(tenantId, fecha);
  return calculateForecast(departures);
}
