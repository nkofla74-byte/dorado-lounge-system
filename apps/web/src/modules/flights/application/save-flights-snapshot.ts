import type { FlightsProvider } from './ports/flights-provider.port';
import type { FlightsRepository } from './ports/flights-repository.port';

const AIRPORT_IATA = 'BOG';

export interface SnapshotResult {
  departures: number;
  arrivals: number;
}

// Captura snapshot del día actual: salidas + llegadas de BOG, persiste y refresca la vista.
export async function saveFlightsSnapshot(
  provider: FlightsProvider,
  repo: FlightsRepository,
  tenantId: string,
): Promise<SnapshotResult> {
  const [departures, arrivals] = await Promise.all([
    provider.getFlights({ direction: 'departure', airportIata: AIRPORT_IATA, limit: 100 }),
    provider.getFlights({ direction: 'arrival', airportIata: AIRPORT_IATA, limit: 100 }),
  ]);

  const [depCount, arrCount] = await Promise.all([
    repo.upsertSnapshots(tenantId, departures),
    repo.upsertSnapshots(tenantId, arrivals),
  ]);

  if (depCount + arrCount > 0) {
    await repo.refreshOcupacionDiaria();
  }

  return { departures: depCount, arrivals: arrCount };
}
