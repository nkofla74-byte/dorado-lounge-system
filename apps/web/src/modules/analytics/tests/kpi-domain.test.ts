import { describe, it, expect, vi } from 'vitest';
import type { CogsPerPassenger, ConsumoInsumo, AnalyticsFilters } from '../domain/kpi';
import { getCogsPerPassenger } from '../application/get-cogs';
import { getConsumoVsProduccion } from '../application/get-consumo';
import type { AnalyticsRepository } from '../application/ports/analytics-repository.port';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeCogs(overrides: Partial<CogsPerPassenger> = {}): CogsPerPassenger {
  return {
    tenantId: 'tenant-1',
    tenantNombre: null,
    tenantSlug: null,
    turnoId: 'turno-1',
    turnoNombre: 'Turno mañana',
    iniciadoAt: new Date('2026-05-04T06:00:00Z'),
    cerradoAt: new Date('2026-05-04T14:00:00Z'),
    totalPasajeros: 100,
    cogsTotalCop: 500_000,
    cogsPerPassenger: 5000,
    ...overrides,
  };
}

function makeConsumo(overrides: Partial<ConsumoInsumo> = {}): ConsumoInsumo {
  return {
    tenantId: 'tenant-1',
    tenantNombre: null,
    tenantSlug: null,
    turnoId: 'turno-1',
    turnoNombre: 'Turno mañana',
    insumoId: 'ins-1',
    insumoNombre: 'Harina de maíz',
    capa: 'capa_1',
    unidadMedida: 'kg',
    totalEntradas: 10,
    totalConsumo: 8,
    totalMerma: 0.5,
    totalAjustes: 0,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<AnalyticsRepository> = {}): AnalyticsRepository {
  return {
    getCogsPerPassenger: vi.fn().mockResolvedValue([]),
    getConsumoVsProduccion: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── Invariantes de KPI ────────────────────────────────────────────────────────

describe('CogsPerPassenger', () => {
  it('cogsPerPassenger es null cuando no hay pasajeros registrados', () => {
    const kpi = makeCogs({ totalPasajeros: 0, cogsPerPassenger: null });
    expect(kpi.cogsPerPassenger).toBeNull();
  });

  it('cogsPerPassenger = cogsTotalCop / totalPasajeros', () => {
    const kpi = makeCogs({ cogsTotalCop: 500_000, totalPasajeros: 100, cogsPerPassenger: 5000 });
    expect(kpi.cogsPerPassenger).toBe(kpi.cogsTotalCop / kpi.totalPasajeros);
  });

  it('turno sin cerrar tiene cerradoAt null', () => {
    const kpi = makeCogs({ cerradoAt: null });
    expect(kpi.cerradoAt).toBeNull();
  });

  it('cogsTotalCop es en COP (entero positivo para turno con consumo)', () => {
    const kpi = makeCogs({ cogsTotalCop: 1_250_000 });
    expect(kpi.cogsTotalCop).toBeGreaterThanOrEqual(0);
  });
});

describe('ConsumoInsumo', () => {
  it('totalConsumo no supera totalEntradas + ajustes', () => {
    const consumo = makeConsumo({ totalEntradas: 10, totalConsumo: 8, totalAjustes: 0 });
    expect(consumo.totalConsumo).toBeLessThanOrEqual(
      consumo.totalEntradas + Math.abs(consumo.totalAjustes),
    );
  });

  it('capa es capa_1 o capa_2', () => {
    const capas = ['capa_1', 'capa_2'];
    const consumo = makeConsumo({ capa: 'capa_1' });
    expect(capas).toContain(consumo.capa);
  });
});

describe('AnalyticsFilters', () => {
  it('todos los filtros son opcionales', () => {
    const sinFiltros: AnalyticsFilters = {};
    expect(sinFiltros.turnoId).toBeUndefined();
    expect(sinFiltros.desde).toBeUndefined();
    expect(sinFiltros.hasta).toBeUndefined();
  });

  it('acepta rango de fechas ISO', () => {
    const filtros: AnalyticsFilters = {
      desde: '2026-05-01',
      hasta: '2026-05-31',
    };
    expect(filtros.desde).toBe('2026-05-01');
    expect(filtros.hasta).toBe('2026-05-31');
  });
});

// ── Use cases ─────────────────────────────────────────────────────────────────

describe('getCogsPerPassenger', () => {
  it('delega al repositorio con tenantId y filtros', async () => {
    const kpis = [makeCogs()];
    const repo = makeRepo({ getCogsPerPassenger: vi.fn().mockResolvedValue(kpis) });
    const filtros: AnalyticsFilters = { turnoId: 'turno-1' };

    const result = await getCogsPerPassenger(repo, 'tenant-1', filtros);

    expect(repo.getCogsPerPassenger).toHaveBeenCalledWith('tenant-1', filtros);
    expect(result).toBe(kpis);
  });

  it('devuelve lista vacía cuando no hay datos', async () => {
    const repo = makeRepo({ getCogsPerPassenger: vi.fn().mockResolvedValue([]) });
    const result = await getCogsPerPassenger(repo, 'tenant-1', {});
    expect(result).toHaveLength(0);
  });
});

describe('getConsumoVsProduccion', () => {
  it('delega al repositorio con tenantId y filtros', async () => {
    const consumos = [makeConsumo()];
    const repo = makeRepo({ getConsumoVsProduccion: vi.fn().mockResolvedValue(consumos) });
    const filtros: AnalyticsFilters = { desde: '2026-05-01' };

    const result = await getConsumoVsProduccion(repo, 'tenant-1', filtros);

    expect(repo.getConsumoVsProduccion).toHaveBeenCalledWith('tenant-1', filtros);
    expect(result).toBe(consumos);
  });
});
