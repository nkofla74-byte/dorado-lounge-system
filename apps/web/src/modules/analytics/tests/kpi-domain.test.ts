import { describe, it, expect, vi } from 'vitest';
import type { ConsumoInsumo, AnalyticsFilters } from '../domain/kpi';
import { getConsumoVsProduccion } from '../application/get-consumo';
import type { AnalyticsRepository } from '../application/ports/analytics-repository.port';

// ── Factories ──────────────────────────────────────────────────────────────────

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
    unidadMedida: 'g',
    totalEntradas: 10,
    totalConsumo: 8,
    totalMerma: 0.5,
    totalAjustes: 0,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<AnalyticsRepository> = {}): AnalyticsRepository {
  return {
    getConsumoVsProduccion: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── Invariantes de KPI ────────────────────────────────────────────────────────

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
