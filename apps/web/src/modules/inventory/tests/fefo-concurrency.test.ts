import { describe, it, expect } from 'vitest';
import { cantidadConMerma } from '../domain/merma';

interface Lote {
  id: string;
  insumoId: string;
  tenantId: string;
  cantidadActual: number;
  fechaVencimiento: string;
  activo: boolean;
}

interface DeduccionResult {
  ok: boolean;
  error?: string;
  lotesAfectados?: { loteId: string; descontado: number }[];
}

function createFEFOSimulator() {
  const lotes: Lote[] = [];
  const operaciones = new Set<string>();
  let lockHeld = false;

  function addLote(lote: Lote) {
    lotes.push(lote);
  }

  async function descontarFEFO(
    tenantId: string,
    insumoId: string,
    cantidad: number,
    idempotencyKey: string,
  ): Promise<DeduccionResult> {
    if (operaciones.has(idempotencyKey)) {
      return { ok: true, lotesAfectados: [] };
    }

    if (lockHeld) {
      return { ok: false, error: 'LOCK_CONFLICT' };
    }

    lockHeld = true;

    try {
      const lotesDisponibles = lotes
        .filter(
          (l) =>
            l.insumoId === insumoId && l.tenantId === tenantId && l.activo && l.cantidadActual > 0,
        )
        .sort(
          (a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime(),
        );

      let restante = cantidad;
      const afectados: { loteId: string; descontado: number }[] = [];

      for (const lote of lotesDisponibles) {
        if (restante <= 0) break;
        const descuento = Math.min(lote.cantidadActual, restante);
        lote.cantidadActual = Math.round((lote.cantidadActual - descuento) * 10000) / 10000;
        restante = Math.round((restante - descuento) * 10000) / 10000;
        afectados.push({ loteId: lote.id, descontado: descuento });
      }

      if (restante > 0) {
        for (const a of afectados) {
          const lote = lotes.find((l) => l.id === a.loteId)!;
          lote.cantidadActual = Math.round((lote.cantidadActual + a.descontado) * 10000) / 10000;
        }
        return { ok: false, error: 'STOCK_INSUFICIENTE' };
      }

      operaciones.add(idempotencyKey);
      return { ok: true, lotesAfectados: afectados };
    } finally {
      lockHeld = false;
    }
  }

  function getStock(tenantId: string, insumoId: string): number {
    return lotes
      .filter((l) => l.tenantId === tenantId && l.insumoId === insumoId && l.activo)
      .reduce((sum, l) => sum + l.cantidadActual, 0);
  }

  return { addLote, descontarFEFO, getStock, lotes };
}

describe('FEFO — deducción concurrente de inventario', () => {
  it('descuenta del lote más próximo a vencer primero', async () => {
    const sim = createFEFOSimulator();
    sim.addLote({
      id: 'lote-viejo',
      insumoId: 'pollo',
      tenantId: 't1',
      cantidadActual: 5,
      fechaVencimiento: '2026-05-26',
      activo: true,
    });
    sim.addLote({
      id: 'lote-nuevo',
      insumoId: 'pollo',
      tenantId: 't1',
      cantidadActual: 10,
      fechaVencimiento: '2026-06-15',
      activo: true,
    });

    const result = await sim.descontarFEFO('t1', 'pollo', 3, 'op-1');

    expect(result.ok).toBe(true);
    expect(result.lotesAfectados).toHaveLength(1);
    expect(result.lotesAfectados![0]!.loteId).toBe('lote-viejo');
    expect(sim.lotes.find((l) => l.id === 'lote-viejo')!.cantidadActual).toBe(2);
    expect(sim.lotes.find((l) => l.id === 'lote-nuevo')!.cantidadActual).toBe(10);
  });

  it('cruza lotes cuando uno no alcanza (FEFO spanning)', async () => {
    const sim = createFEFOSimulator();
    sim.addLote({
      id: 'lote-1',
      insumoId: 'pollo',
      tenantId: 't1',
      cantidadActual: 3,
      fechaVencimiento: '2026-05-26',
      activo: true,
    });
    sim.addLote({
      id: 'lote-2',
      insumoId: 'pollo',
      tenantId: 't1',
      cantidadActual: 10,
      fechaVencimiento: '2026-06-01',
      activo: true,
    });

    const result = await sim.descontarFEFO('t1', 'pollo', 7, 'op-1');

    expect(result.ok).toBe(true);
    expect(result.lotesAfectados).toHaveLength(2);
    expect(sim.lotes.find((l) => l.id === 'lote-1')!.cantidadActual).toBe(0);
    expect(sim.lotes.find((l) => l.id === 'lote-2')!.cantidadActual).toBe(6);
  });

  it('rechaza si stock insuficiente y no deja stock negativo', async () => {
    const sim = createFEFOSimulator();
    sim.addLote({
      id: 'lote-1',
      insumoId: 'pollo',
      tenantId: 't1',
      cantidadActual: 5,
      fechaVencimiento: '2026-05-26',
      activo: true,
    });

    const result = await sim.descontarFEFO('t1', 'pollo', 10, 'op-1');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('STOCK_INSUFICIENTE');
    expect(sim.lotes.find((l) => l.id === 'lote-1')!.cantidadActual).toBe(5);
  });

  it('operación idempotente: segundo envío con misma key no descuenta de nuevo', async () => {
    const sim = createFEFOSimulator();
    sim.addLote({
      id: 'lote-1',
      insumoId: 'pollo',
      tenantId: 't1',
      cantidadActual: 10,
      fechaVencimiento: '2026-05-26',
      activo: true,
    });

    await sim.descontarFEFO('t1', 'pollo', 3, 'op-same');
    await sim.descontarFEFO('t1', 'pollo', 3, 'op-same');

    expect(sim.getStock('t1', 'pollo')).toBe(7);
  });

  it('dos despachos secuenciales con keys distintas descuentan correctamente', async () => {
    const sim = createFEFOSimulator();
    sim.addLote({
      id: 'lote-1',
      insumoId: 'pollo',
      tenantId: 't1',
      cantidadActual: 10,
      fechaVencimiento: '2026-05-26',
      activo: true,
    });

    await sim.descontarFEFO('t1', 'pollo', 3, 'op-1');
    await sim.descontarFEFO('t1', 'pollo', 4, 'op-2');

    expect(sim.getStock('t1', 'pollo')).toBe(3);
  });

  it('merma incrementa la cantidad bruta descontada', () => {
    const neta = 100;
    const coef = 0.1;
    const bruta = cantidadConMerma(neta, coef);

    expect(bruta).toBeCloseTo(111.1111, 4);
    expect(bruta).toBeGreaterThan(neta);
  });

  it('aislamiento de tenant: descuento de tenant A no afecta stock de tenant B', async () => {
    const sim = createFEFOSimulator();
    sim.addLote({
      id: 'lote-A',
      insumoId: 'pollo',
      tenantId: 'tenant-A',
      cantidadActual: 10,
      fechaVencimiento: '2026-05-26',
      activo: true,
    });
    sim.addLote({
      id: 'lote-B',
      insumoId: 'pollo',
      tenantId: 'tenant-B',
      cantidadActual: 10,
      fechaVencimiento: '2026-05-26',
      activo: true,
    });

    await sim.descontarFEFO('tenant-A', 'pollo', 5, 'op-1');

    expect(sim.getStock('tenant-A', 'pollo')).toBe(5);
    expect(sim.getStock('tenant-B', 'pollo')).toBe(10);
  });

  it('stock no puede quedar negativo tras deducción parcial fallida', async () => {
    const sim = createFEFOSimulator();
    sim.addLote({
      id: 'lote-1',
      insumoId: 'sal',
      tenantId: 't1',
      cantidadActual: 2,
      fechaVencimiento: '2026-06-01',
      activo: true,
    });
    sim.addLote({
      id: 'lote-2',
      insumoId: 'sal',
      tenantId: 't1',
      cantidadActual: 1,
      fechaVencimiento: '2026-06-15',
      activo: true,
    });

    const result = await sim.descontarFEFO('t1', 'sal', 5, 'op-exceed');

    expect(result.ok).toBe(false);
    expect(sim.getStock('t1', 'sal')).toBe(3);
  });
});
