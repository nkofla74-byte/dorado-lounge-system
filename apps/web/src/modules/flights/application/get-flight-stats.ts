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

  // "hoy" = la fecha más reciente con datos en la ventana de 7 días.
  const fechaMasReciente = ultimos7d[0]?.fecha;
  const hoy = fechaMasReciente ? ultimos7d.filter((r) => r.fecha === fechaMasReciente) : [];

  return { hoy, ultimos7d, topAerolineas };
}
