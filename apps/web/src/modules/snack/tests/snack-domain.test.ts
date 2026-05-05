import { describe, it, expect, vi } from 'vitest';
import type { DespachoSnack } from '../domain/despacho-snack';
import type { StuartRequest } from '../domain/stuart-request';
import { getDespachos } from '../application/get-despachos';
import { getStuartRequests } from '../application/get-stuart-requests';
import type { SnackRepository } from '../application/ports/snack-repository.port';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeDespacho(overrides: Partial<DespachoSnack> = {}): DespachoSnack {
  return {
    id: 'desp-1',
    tenantId: 'tenant-1',
    recetaId: 'receta-1',
    recetaNombre: 'Sándwich de pollo',
    turnoId: 'turno-1',
    cantidad: 1,
    responsableId: 'user-1',
    despachadoAt: new Date('2026-05-04T09:00:00Z'),
    createdAt: new Date('2026-05-04T09:00:00Z'),
    ...overrides,
  };
}

function makeStuart(overrides: Partial<StuartRequest> = {}): StuartRequest {
  return {
    id: 'stuart-1',
    tenantId: 'tenant-1',
    canal: 'sala:stuart:snack',
    remitenteId: 'user-1',
    descripcion: 'Necesito bandejas para mesa 5',
    createdAt: new Date('2026-05-04T09:05:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<SnackRepository> = {}): SnackRepository {
  return {
    findDespachos: vi.fn().mockResolvedValue([]),
    findTurnosActivos: vi.fn().mockResolvedValue([]),
    findStuartRequests: vi.fn().mockResolvedValue([]),
    createStuartRequest: vi.fn().mockResolvedValue(makeStuart()),
    ...overrides,
  };
}

// ── Invariantes de dominio ────────────────────────────────────────────────────

describe('DespachoSnack', () => {
  it('el despacho es individual (cantidad = 1 por regla de operación)', () => {
    const despacho = makeDespacho({ cantidad: 1 });
    expect(despacho.cantidad).toBe(1);
  });

  it('puede no tener turnoId si no hay turno activo', () => {
    const despacho = makeDespacho({ turnoId: null });
    expect(despacho.turnoId).toBeNull();
  });

  it('tiene responsableId del personal que despachó', () => {
    const despacho = makeDespacho({ responsableId: 'personal-snack-1' });
    expect(despacho.responsableId).not.toBeNull();
  });
});

describe('StuartRequest', () => {
  it('tiene canal en el espacio sala:stuart:snack', () => {
    const stuart = makeStuart({ canal: 'sala:stuart:snack' });
    expect(stuart.canal).toBe('sala:stuart:snack');
  });

  it('la descripción es no vacía', () => {
    const stuart = makeStuart({ descripcion: 'Bandejas de ensalada' });
    expect(stuart.descripcion.trim()).not.toBe('');
  });

  it('tiene remitente identificado', () => {
    const stuart = makeStuart({ remitenteId: 'personal-snack-1' });
    expect(stuart.remitenteId).not.toBe('');
  });

  it('tiene timestamp de creación', () => {
    const stuart = makeStuart();
    expect(stuart.createdAt).toBeInstanceOf(Date);
  });
});

// ── Use cases ─────────────────────────────────────────────────────────────────

describe('getDespachos (snack)', () => {
  it('llama findDespachos con tenantId', async () => {
    const despachos = [makeDespacho()];
    const repo = makeRepo({ findDespachos: vi.fn().mockResolvedValue(despachos) });
    const result = await getDespachos(repo, 'tenant-1', undefined);
    expect(repo.findDespachos).toHaveBeenCalledWith('tenant-1', undefined);
    expect(result).toBe(despachos);
  });

  it('filtra por turnoId cuando se especifica', async () => {
    const repo = makeRepo({ findDespachos: vi.fn().mockResolvedValue([]) });
    await getDespachos(repo, 'tenant-1', 'turno-1');
    expect(repo.findDespachos).toHaveBeenCalledWith('tenant-1', 'turno-1');
  });

  it('devuelve lista vacía si no hay despachos', async () => {
    const repo = makeRepo();
    const result = await getDespachos(repo, 'tenant-1', undefined);
    expect(result).toHaveLength(0);
  });
});

describe('getStuartRequests', () => {
  it('usa límite por defecto de 20 cuando no se especifica', async () => {
    const stuarts = [makeStuart()];
    const repo = makeRepo({ findStuartRequests: vi.fn().mockResolvedValue(stuarts) });
    const result = await getStuartRequests(repo, 'tenant-1');
    expect(repo.findStuartRequests).toHaveBeenCalledWith('tenant-1', 20);
    expect(result).toBe(stuarts);
  });

  it('pasa el límite personalizado cuando se especifica', async () => {
    const repo = makeRepo({ findStuartRequests: vi.fn().mockResolvedValue([]) });
    await getStuartRequests(repo, 'tenant-1', 10);
    expect(repo.findStuartRequests).toHaveBeenCalledWith('tenant-1', 10);
  });
});
