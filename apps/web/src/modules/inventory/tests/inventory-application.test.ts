import { describe, it, expect, vi } from 'vitest';
import { createInsumo } from '../application/create-insumo';
import { updateInsumo } from '../application/update-insumo';
import { createLote } from '../application/create-lote';
import { getInsumos } from '../application/get-insumos';
import type { InsumoRepository } from '../application/ports/insumo-repository.port';
import type { Insumo, InsumoWithStock, Lote, CreateInsumoInput } from '../domain/insumo';

function makeInsumo(overrides: Partial<Insumo> = {}): Insumo {
  return {
    id: 'ins-1',
    tenantId: 'tenant-1',
    nombre: 'Harina de trigo',
    codigo: 'HT-001',
    capa: 'capa_1',
    unidadMedida: 'g',
    stockMinimo: 5,
    mermaDefault: 0.05,
    activo: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeInsumoWithStock(overrides: Partial<InsumoWithStock> = {}): InsumoWithStock {
  return { ...makeInsumo(), stockActual: 25, ...overrides };
}

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    tenantId: 'tenant-1',
    insumoId: 'ins-1',
    codigo: 'L-001',
    cantidadInicial: 50,
    cantidadActual: 50,
    fechaRecibido: '2026-05-01',
    fechaVencimiento: '2026-06-01',
    proveedor: 'Proveedor A',
    proveedorId: null,
    costoUnitario: 3500,
    cantidadEmpaques: null,
    pesoUnitario: null,
    unidadPeso: null,
    activo: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function createInMemoryRepo(): InsumoRepository & { insumos: InsumoWithStock[]; lotes: Lote[] } {
  const insumos: InsumoWithStock[] = [];
  const lotes: Lote[] = [];
  let counter = 0;

  return {
    insumos,
    lotes,
    async findAll() {
      return insumos.filter((i) => i.activo);
    },
    async create(tenantId: string, input: CreateInsumoInput) {
      counter++;
      const ins = makeInsumo({
        id: `ins-${counter}`,
        tenantId,
        nombre: input.nombre,
        codigo: input.codigo ?? '',
        capa: input.capa,
        unidadMedida: input.unidadMedida,
        stockMinimo: input.stockMinimo,
        mermaDefault: input.mermaDefault,
      });
      insumos.push({ ...ins, stockActual: 0 });
      return ins;
    },
    async update(tenantId: string, input) {
      const idx = insumos.findIndex((i) => i.id === input.id && i.tenantId === tenantId);
      if (idx === -1) throw new Error('NOT_FOUND');
      const existing = insumos[idx]!;
      const updated: InsumoWithStock = {
        ...existing,
        nombre: input.nombre,
        stockMinimo: input.stockMinimo,
        mermaDefault: input.mermaDefault,
      };
      insumos[idx] = updated;
      return updated;
    },
    async findLotesByInsumo(insumoId: string) {
      return lotes.filter((l) => l.insumoId === insumoId);
    },
    async createLote(tenantId: string, input) {
      counter++;
      const lote = makeLote({
        id: `lote-${counter}`,
        tenantId,
        insumoId: input.insumoId,
        cantidadInicial: input.cantidadInicial,
        cantidadActual: input.cantidadInicial,
        fechaVencimiento: input.fechaVencimiento ?? null,
        proveedor: input.proveedor ?? null,
        proveedorId: input.proveedorId ?? null,
        costoUnitario: input.costoUnitario ?? null,
      });
      lotes.push(lote);
      const ins = insumos.find((i) => i.id === input.insumoId);
      if (ins) ins.stockActual += input.cantidadInicial;
      return lote;
    },
  };
}

describe('createInsumo (application)', () => {
  it('crea un insumo y lo persiste en el repo', async () => {
    const repo = createInMemoryRepo();
    const result = await createInsumo(repo, 'tenant-1', {
      nombre: 'Azúcar',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 10,
      mermaDefault: 0.02,
    });
    expect(result.nombre).toBe('Azúcar');
    expect(result.tenantId).toBe('tenant-1');
    expect(repo.insumos).toHaveLength(1);
  });

  it('asigna stock inicial en 0', async () => {
    const repo = createInMemoryRepo();
    await createInsumo(repo, 'tenant-1', {
      nombre: 'Sal',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 2,
      mermaDefault: 0,
    });
    expect(repo.insumos[0]?.stockActual).toBe(0);
  });

  it('múltiples insumos tienen IDs distintos', async () => {
    const repo = createInMemoryRepo();
    const a = await createInsumo(repo, 'tenant-1', {
      nombre: 'A',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 0,
      mermaDefault: 0,
    });
    const b = await createInsumo(repo, 'tenant-1', {
      nombre: 'B',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 0,
      mermaDefault: 0,
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe('updateInsumo (application)', () => {
  it('actualiza nombre y stock mínimo', async () => {
    const repo = createInMemoryRepo();
    const ins = await createInsumo(repo, 'tenant-1', {
      nombre: 'Harina',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 5,
      mermaDefault: 0.05,
    });
    const updated = await updateInsumo(repo, 'tenant-1', {
      id: ins.id,
      nombre: 'Harina integral',
      stockMinimo: 10,
      mermaDefault: 0.03,
    });
    expect(updated.nombre).toBe('Harina integral');
    expect(updated.stockMinimo).toBe(10);
    expect(updated.mermaDefault).toBe(0.03);
  });

  it('lanza error si el insumo no existe', async () => {
    const repo = createInMemoryRepo();
    await expect(
      updateInsumo(repo, 'tenant-1', {
        id: 'no-existe',
        nombre: 'X',
        stockMinimo: 0,
        mermaDefault: 0,
      }),
    ).rejects.toThrow('NOT_FOUND');
  });
});

describe('createLote (application)', () => {
  it('crea un lote vinculado al insumo', async () => {
    const repo = createInMemoryRepo();
    const ins = await createInsumo(repo, 'tenant-1', {
      nombre: 'Leche',
      capa: 'capa_1',
      unidadMedida: 'ml',
      stockMinimo: 10,
      mermaDefault: 0,
    });
    const lote = await createLote(repo, 'tenant-1', {
      insumoId: ins.id,
      cantidadInicial: 100,
      fechaVencimiento: '2026-06-15',
    });
    expect(lote.insumoId).toBe(ins.id);
    expect(lote.cantidadInicial).toBe(100);
    expect(lote.cantidadActual).toBe(100);
  });

  it('incrementa el stock del insumo al crear lote', async () => {
    const repo = createInMemoryRepo();
    const ins = await createInsumo(repo, 'tenant-1', {
      nombre: 'Mantequilla',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 2,
      mermaDefault: 0,
    });
    await createLote(repo, 'tenant-1', { insumoId: ins.id, cantidadInicial: 20 });
    await createLote(repo, 'tenant-1', { insumoId: ins.id, cantidadInicial: 15 });
    expect(repo.insumos[0]?.stockActual).toBe(35);
  });

  it('lote sin fecha de vencimiento es válido', async () => {
    const repo = createInMemoryRepo();
    const ins = await createInsumo(repo, 'tenant-1', {
      nombre: 'Sal',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 0,
      mermaDefault: 0,
    });
    const lote = await createLote(repo, 'tenant-1', { insumoId: ins.id, cantidadInicial: 50 });
    expect(lote.fechaVencimiento).toBeNull();
  });
});

describe('getInsumos (application)', () => {
  it('retorna solo insumos activos', async () => {
    const repo = createInMemoryRepo();
    await createInsumo(repo, 'tenant-1', {
      nombre: 'Activo',
      capa: 'capa_1',
      unidadMedida: 'g',
      stockMinimo: 0,
      mermaDefault: 0,
    });
    repo.insumos.push(makeInsumoWithStock({ id: 'ins-inactive', activo: false }));
    const result = await getInsumos(repo);
    expect(result).toHaveLength(1);
    expect(result[0]?.nombre).toBe('Activo');
  });

  it('retorna lista vacía cuando no hay insumos', async () => {
    const repo = createInMemoryRepo();
    const result = await getInsumos(repo);
    expect(result).toHaveLength(0);
  });
});
