import { describe, it, expect, vi } from 'vitest';
import { saveFlightsSnapshot } from '../application/save-flights-snapshot';
import type { Flight } from '../domain/flight';
import type { FlightsRepository } from '../application/ports/flights-repository.port';
import type { FlightsProvider } from '../application/ports/flights-provider.port';

function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    flightNumber: 'AV9606',
    airline: 'Avianca',
    origin: 'BOG',
    destination: 'MDE',
    scheduledTime: new Date('2026-05-23T14:00:00Z'),
    estimatedTime: null,
    actualTime: null,
    status: 'scheduled',
    gate: null,
    terminal: null,
    direction: 'departure',
    aircraftIata: '320',
    ...overrides,
  };
}

function makeRepo(overrides: Partial<FlightsRepository> = {}): FlightsRepository {
  return {
    upsertSnapshots: vi.fn(async (_t, flights) => flights.length),
    refreshOcupacionDiaria: vi.fn(async () => undefined),
    getOcupacionUltimos7d: vi.fn(async () => []),
    getTopAerolineas: vi.fn(async () => []),
    getDeparturesForDate: vi.fn(async () => []),
    ...overrides,
  };
}

function makeProvider(deps: Flight[] = [], arrs: Flight[] = []): FlightsProvider {
  return {
    getFlights: vi.fn(async (q) => (q.direction === 'departure' ? deps : arrs)),
  };
}

describe('saveFlightsSnapshot', () => {
  it('persiste salidas y llegadas en paralelo y devuelve los conteos', async () => {
    const deps = [makeFlight({ flightNumber: 'AV1' }), makeFlight({ flightNumber: 'AV2' })];
    const arrs = [makeFlight({ flightNumber: 'LA1', direction: 'arrival' })];
    const repo = makeRepo();
    const provider = makeProvider(deps, arrs);

    const result = await saveFlightsSnapshot(provider, repo, 'tenant-1');

    expect(result).toEqual({ departures: 2, arrivals: 1 });
    expect(repo.upsertSnapshots).toHaveBeenCalledTimes(2);
    expect(repo.upsertSnapshots).toHaveBeenCalledWith('tenant-1', deps);
    expect(repo.upsertSnapshots).toHaveBeenCalledWith('tenant-1', arrs);
  });

  it('refresca la vista materializada cuando hubo escritura', async () => {
    const repo = makeRepo();
    const provider = makeProvider([makeFlight()], []);
    await saveFlightsSnapshot(provider, repo, 'tenant-1');
    expect(repo.refreshOcupacionDiaria).toHaveBeenCalledOnce();
  });

  it('NO refresca la vista si no hubo nada que persistir', async () => {
    const repo = makeRepo();
    const provider = makeProvider([], []);
    await saveFlightsSnapshot(provider, repo, 'tenant-1');
    expect(repo.refreshOcupacionDiaria).not.toHaveBeenCalled();
    expect(repo.upsertSnapshots).toHaveBeenCalledTimes(2); // se llaman pero con []
  });

  it('pide BOG y limit 100 al provider para cada dirección', async () => {
    const repo = makeRepo();
    const provider = makeProvider();
    await saveFlightsSnapshot(provider, repo, 'tenant-1');
    expect(provider.getFlights).toHaveBeenCalledWith({
      direction: 'departure',
      airportIata: 'BOG',
      limit: 100,
    });
    expect(provider.getFlights).toHaveBeenCalledWith({
      direction: 'arrival',
      airportIata: 'BOG',
      limit: 100,
    });
  });
});
