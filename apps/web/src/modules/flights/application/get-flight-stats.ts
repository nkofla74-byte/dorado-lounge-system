import type { FlightsRepository } from './ports/flights-repository.port';
import type { FlightStats } from '../domain/flight';

const VENTANA_TOP_AEROLINEAS_DIAS = 7;

export async function getFlightStats(
  repo: FlightsRepository,
  tenantId: string,
): Promise<FlightStats> {
  const [ultimos7d, topAerolineas] = await Promise.all([
    repo.getOcupacionUltimos7d(tenantId),
    repo.getTopAerolineas(tenantId, VENTANA_TOP_AEROLINEAS_DIAS),
  ]);

  // "hoy" = el día más reciente con datos en la ventana de 7 días.
  const hoy = ultimos7d[0] ?? null;

  return { hoy, ultimos7d, topAerolineas };
}
