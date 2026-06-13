import { describe, it, expect, vi } from 'vitest';
import { createRequisicion } from '../application/create-requisicion';
import { transitionRequisicion } from '../application/transition-requisicion';
import type { RequisicionRepository } from '../application/ports/requisicion-repository.port';

function repoMock(overrides: Partial<RequisicionRepository> = {}): RequisicionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findColaAlmacen: vi.fn(),
    findByArea: vi.fn(),
    transition: vi.fn(),
    despachar: vi.fn(),
    ...overrides,
  };
}

describe('createRequisicion use case', () => {
  it('delega en el repositorio con tenant y usuario', async () => {
    const repo = repoMock({
      create: vi.fn().mockResolvedValue({ id: 'r1', estado: 'solicitada', items: [] }),
    });
    const r = await createRequisicion(repo, 't1', 'u1', {
      areaSolicitante: 'cocina_fria',
      idempotencyKey: 'k1',
      items: [{ insumoId: 'i1', cantidadSolicitada: 2, unidad: 'g' }],
    });
    expect(r.id).toBe('r1');
    expect(repo.create).toHaveBeenCalledWith(
      't1',
      'u1',
      expect.objectContaining({ areaSolicitante: 'cocina_fria' }),
    );
  });
});

describe('transitionRequisicion use case', () => {
  it('rechaza una transición ilegal antes de tocar el repo', async () => {
    const repo = repoMock({
      findById: vi.fn().mockResolvedValue({ id: 'r1', estado: 'solicitada', version: 1 }),
    });
    await expect(transitionRequisicion(repo, 'r1', 't1', 'u1', 'despachada', 1)).rejects.toThrow(
      /no se puede pasar/i,
    );
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it('lanza NOT_FOUND si la requisición no existe', async () => {
    const repo = repoMock({ findById: vi.fn().mockResolvedValue(null) });
    await expect(
      transitionRequisicion(repo, 'rX', 't1', 'u1', 'en_alistamiento', 1),
    ).rejects.toThrow(/no encontrada/i);
  });

  it('ejecuta una transición legal', async () => {
    const repo = repoMock({
      findById: vi.fn().mockResolvedValue({ id: 'r1', estado: 'solicitada', version: 1 }),
      transition: vi.fn().mockResolvedValue({ id: 'r1', estado: 'en_alistamiento', version: 2 }),
    });
    const r = await transitionRequisicion(repo, 'r1', 't1', 'u1', 'en_alistamiento', 1);
    expect(r.estado).toBe('en_alistamiento');
    expect(repo.transition).toHaveBeenCalledWith('r1', 't1', 'u1', 'en_alistamiento', 1);
  });
});
