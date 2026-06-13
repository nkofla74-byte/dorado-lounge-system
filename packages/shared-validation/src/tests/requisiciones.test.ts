import { describe, it, expect } from 'vitest';
import {
  createRequisicionSchema,
  despacharRequisicionSchema,
  transicionRequisicionSchema,
} from '../index';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('createRequisicionSchema', () => {
  it('acepta una requisición válida', () => {
    const r = createRequisicionSchema.safeParse({
      areaSolicitante: 'cocina_caliente',
      idempotencyKey: 'req-1',
      items: [{ insumoId: UUID, cantidadSolicitada: 5, unidad: 'g' }],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza área inválida (cocina legacy)', () => {
    const r = createRequisicionSchema.safeParse({
      areaSolicitante: 'cocina',
      idempotencyKey: 'req-1',
      items: [{ insumoId: UUID, cantidadSolicitada: 5, unidad: 'g' }],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza requisición sin items', () => {
    const r = createRequisicionSchema.safeParse({
      areaSolicitante: 'amex',
      idempotencyKey: 'req-1',
      items: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('despacharRequisicionSchema', () => {
  it('exige version y al menos un item con cantidad despachada', () => {
    const ok = despacharRequisicionSchema.safeParse({
      requisicionId: UUID,
      version: 1,
      items: [{ itemId: UUID, cantidadDespachada: 3 }],
    });
    expect(ok.success).toBe(true);
    const bad = despacharRequisicionSchema.safeParse({
      requisicionId: UUID,
      version: 1,
      items: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe('transicionRequisicionSchema', () => {
  it('exige requisicionId y version', () => {
    expect(transicionRequisicionSchema.safeParse({ requisicionId: UUID, version: 2 }).success).toBe(
      true,
    );
  });
});
