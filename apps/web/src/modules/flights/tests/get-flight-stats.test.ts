import { describe, it, expect, vi } from 'vitest';
import { getFlightStats } from '../application/get-flight-stats';
import type { FlightsRepository } from '../application/ports/flights-repository.port';
import type { OcupacionDiaria } from '../domain/flight';

function row(overrides: Partial<OcupacionDiaria> = {}): OcupacionDiaria {
  return {
    fecha: '2026-05-22',
    direccion: 'departure',
    totalVuelos: 10,
    vuelosCancelados: 0,
    vuelosSinCapacidad: 1,
    capacidadEstimada: 1800,
    pasajerosReales: 900,
    ocupacionPct: 50,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<FlightsRepository> = {}): FlightsRepository {
  return {
    upsertSnapshots: vi.fn(),
    refreshOcupacionDiaria: vi.fn(),
    getOcupacionUltimos7d: vi.fn(async () => []),
    getTopAerolineas: vi.fn(async () => []),
    ...overrides,
  };
}

describe('getFlightStats', () => {
  it('separa "hoy" como la fecha más reciente con datos', async () => {
    const repo = makeRepo({
      getOcupacionUltimos7d: vi.fn(async () => [
        row({ fecha: '2026-05-22', direccion: 'departure' }),
        row({ fecha: '2026-05-22', direccion: 'arrival' }),
        row({ fecha: '2026-05-21', direccion: 'departure' }),
      ]),
    });

    const stats = await getFlightStats(repo, 'tenant-1');

    expect(stats.hoy).toHaveLength(2);
    expect(stats.hoy.every((r) => r.fecha === '2026-05-22')).toBe(true);
    expect(stats.ultimos7d).toHaveLength(3);
  });

  it('devuelve hoy=[] cuando no hay datos en la ventana', async () => {
    const repo = makeRepo();
    const stats = await getFlightStats(repo, 'tenant-1');
    expect(stats.hoy).toEqual([]);
    expect(stats.ultimos7d).toEqual([]);
    expect(stats.topAerolineas).toEqual([]);
  });

  it('pide top aerolíneas con ventana de 7 días', async () => {
    const repo = makeRepo();
    await getFlightStats(repo, 'tenant-1');
    expect(repo.getTopAerolineas).toHaveBeenCalledWith('tenant-1', 7);
  });
});
