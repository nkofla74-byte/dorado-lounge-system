import { describe, it, expect } from 'vitest';
import { createTanda } from '../application/create-tanda';
import { TANDA_TRANSITIONS } from '../domain/tanda';
import type { Tanda, TandaWithIngredientes, CreateTandaInput, EstadoTanda } from '../domain/tanda';
import type { ProductionRepository } from '../application/ports/production-repository.port';

function makeTanda(overrides: Partial<Tanda> = {}): Tanda {
  return {
    id: 'tanda-1',
    tenantId: 'tenant-1',
    recetaId: 'rec-1',
    recetaNombre: 'Pan de bono',
    cantidadTandas: 3,
    estado: 'planificada',
    zonaDestino: 'amex',
    responsableId: null,
    responsableNombre: null,
    turnoId: null,
    turnoNombre: null,
    notas: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createInMemoryRepo(): ProductionRepository & { tandas: Tanda[] } {
  const tandas: Tanda[] = [];
  const seenKeys = new Set<string>();
  let counter = 0;

  return {
    tandas,
    async findAll(tenantId: string) {
      return tandas.filter((t) => t.tenantId === tenantId);
    },
    async create(tenantId: string, input: CreateTandaInput) {
      if (seenKeys.has(`${tenantId}:${input.idempotencyKey}`)) {
        throw new Error('DUPLICATE_TANDA');
      }
      seenKeys.add(`${tenantId}:${input.idempotencyKey}`);
      counter++;
      const t = makeTanda({
        id: `tanda-${counter}`,
        tenantId,
        recetaId: input.recetaId,
        cantidadTandas: input.cantidadTandas,
        zonaDestino: input.zonaDestino,
        notas: input.notas ?? null,
      });
      tandas.push(t);
      return t;
    },
    async findByIdWithIngredientes(
      id: string,
      tenantId: string,
    ): Promise<TandaWithIngredientes | null> {
      const t = tandas.find((t) => t.id === id && t.tenantId === tenantId);
      if (!t) return null;
      return { ...t, ingredientes: [] };
    },
    async updateEstado(id: string, tenantId: string, estado: EstadoTanda) {
      const idx = tandas.findIndex((t) => t.id === id && t.tenantId === tenantId);
      if (idx === -1) throw new Error('NOT_FOUND');
      const current = tandas[idx]!;
      if (!TANDA_TRANSITIONS[current.estado].includes(estado)) {
        throw new Error('INVALID_TRANSITION');
      }
      tandas[idx] = {
        ...current,
        estado,
        startedAt: estado === 'en_proceso' ? new Date() : current.startedAt,
        completedAt: estado === 'completada' ? new Date() : current.completedAt,
        updatedAt: new Date(),
      };
      return tandas[idx]!;
    },
  };
}

describe('createTanda — application', () => {
  it('crea tanda con estado planificada', async () => {
    const repo = createInMemoryRepo();
    const input: CreateTandaInput = {
      recetaId: 'rec-1',
      cantidadTandas: 5,
      zonaDestino: 'amex',
      idempotencyKey: 'key-1',
    };
    const tanda = await createTanda(repo, 'tenant-1', input);
    expect(tanda.estado).toBe('planificada');
    expect(tanda.cantidadTandas).toBe(5);
    expect(tanda.zonaDestino).toBe('amex');
  });

  it('idempotency key duplicada es rechazada', async () => {
    const repo = createInMemoryRepo();
    const input: CreateTandaInput = {
      recetaId: 'rec-1',
      cantidadTandas: 3,
      zonaDestino: 'snack',
      idempotencyKey: 'key-same',
    };
    await createTanda(repo, 'tenant-1', input);
    await expect(createTanda(repo, 'tenant-1', input)).rejects.toThrow('DUPLICATE_TANDA');
  });
});

describe('tanda state machine — application', () => {
  it('planificada → en_proceso → completada', async () => {
    const repo = createInMemoryRepo();
    const tanda = await createTanda(repo, 'tenant-1', {
      recetaId: 'rec-1',
      cantidadTandas: 2,
      zonaDestino: 'buffet',
      idempotencyKey: 'key-1',
    });

    const started = await repo.updateEstado(tanda.id, 'tenant-1', 'en_proceso');
    expect(started.estado).toBe('en_proceso');
    expect(started.startedAt).not.toBeNull();

    const done = await repo.updateEstado(tanda.id, 'tenant-1', 'completada');
    expect(done.estado).toBe('completada');
    expect(done.completedAt).not.toBeNull();
  });

  it('planificada → cancelada', async () => {
    const repo = createInMemoryRepo();
    const tanda = await createTanda(repo, 'tenant-1', {
      recetaId: 'rec-1',
      cantidadTandas: 1,
      zonaDestino: 'amex',
      idempotencyKey: 'key-2',
    });
    const canceled = await repo.updateEstado(tanda.id, 'tenant-1', 'cancelada');
    expect(canceled.estado).toBe('cancelada');
  });

  it('completada no puede transicionar', async () => {
    const repo = createInMemoryRepo();
    const tanda = await createTanda(repo, 'tenant-1', {
      recetaId: 'rec-1',
      cantidadTandas: 1,
      zonaDestino: 'amex',
      idempotencyKey: 'key-3',
    });
    await repo.updateEstado(tanda.id, 'tenant-1', 'en_proceso');
    await repo.updateEstado(tanda.id, 'tenant-1', 'completada');

    await expect(repo.updateEstado(tanda.id, 'tenant-1', 'en_proceso')).rejects.toThrow(
      'INVALID_TRANSITION',
    );
  });

  it('no se puede saltar de planificada a completada', async () => {
    const repo = createInMemoryRepo();
    const tanda = await createTanda(repo, 'tenant-1', {
      recetaId: 'rec-1',
      cantidadTandas: 1,
      zonaDestino: 'amex',
      idempotencyKey: 'key-4',
    });
    await expect(repo.updateEstado(tanda.id, 'tenant-1', 'completada')).rejects.toThrow(
      'INVALID_TRANSITION',
    );
  });

  it('aislamiento de tenant en tandas', async () => {
    const repo = createInMemoryRepo();
    const tanda = await createTanda(repo, 'tenant-A', {
      recetaId: 'rec-1',
      cantidadTandas: 1,
      zonaDestino: 'amex',
      idempotencyKey: 'key-5',
    });
    await expect(repo.updateEstado(tanda.id, 'tenant-B', 'en_proceso')).rejects.toThrow(
      'NOT_FOUND',
    );
  });
});
