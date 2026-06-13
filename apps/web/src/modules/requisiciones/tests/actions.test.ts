import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  // Chain encadenable para la query de turno activo:
  // from('turnos').select().eq().eq().eq().is().maybeSingle()
  const maybeSingle = vi.fn(async () => ({ data: { id: 'turno-1' } }));
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    maybeSingle,
  });
  return {
    assertCan: vi.fn(),
    auditLog: vi.fn(async () => {}),
    emitEvent: vi.fn(async () => {}),
    create: vi.fn(),
    findById: vi.fn(),
    transition: vi.fn(),
    despachar: vi.fn(),
    findColaAlmacen: vi.fn(),
    findByArea: vi.fn(),
    chain,
    maybeSingle,
  };
});

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => mocks.chain }),
}));
vi.mock('@/modules/requisiciones/infrastructure/requisicion-repository', () => ({
  createRequisicionRepository: () => ({
    create: mocks.create,
    findById: mocks.findById,
    transition: mocks.transition,
    despachar: mocks.despachar,
    findColaAlmacen: mocks.findColaAlmacen,
    findByArea: mocks.findByArea,
  }),
}));

import {
  createRequisicion,
  confirmarRecibido,
  cancelarRequisicion,
  getColaAlmacen,
} from '@/modules/requisiciones/actions';

const CTX_CALIENTE = { tenantId: 't1', userId: 'u1', role: 'chef_cocina_caliente' };
const CTX_FRIA = { tenantId: 't1', userId: 'u9', role: 'chef_cocina_fria' };
const CTX_ALMACEN = { tenantId: 't1', userId: 'u2', role: 'personal_almacen' };

const UUID = '11111111-1111-4111-8111-111111111111';
const VALID = {
  areaSolicitante: 'cocina_caliente',
  idempotencyKey: 'k1',
  items: [{ insumoId: UUID, cantidadSolicitada: 2, unidad: 'g' }],
};

describe('createRequisicion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX_CALIENTE);
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'turno-1' } });
  });

  it('rechaza crear requisición de un área ajena al rol', async () => {
    const r = await createRequisicion({ ...VALID, areaSolicitante: 'cocina_fria' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rechaza input inválido con VALIDATION', async () => {
    const r = await createRequisicion({
      areaSolicitante: 'cocina_caliente',
      idempotencyKey: 'k1',
      items: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION');
  });

  it('crea, vincula el turno del usuario, audita y emite REQUISICION_ESTADO', async () => {
    mocks.create.mockResolvedValue({
      id: 'r1',
      areaSolicitante: 'cocina_caliente',
      estado: 'solicitada',
      version: 1,
      items: [],
    });
    const r = await createRequisicion(VALID);
    expect(r.ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(
      't1',
      'u1',
      expect.objectContaining({ turnoId: 'turno-1' }),
    );
    expect(mocks.auditLog).toHaveBeenCalled();
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      't1',
      'sala:almacen',
      expect.objectContaining({ type: 'REQUISICION_ESTADO' }),
    );
  });
});

describe('confirmarRecibido — guard de área', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un chef de fría no puede confirmar una requisición de caliente', async () => {
    mocks.assertCan.mockResolvedValue(CTX_FRIA);
    mocks.findById.mockResolvedValue({
      id: 'r1',
      areaSolicitante: 'cocina_caliente',
      estado: 'despachada',
      version: 3,
    });
    const r = await confirmarRecibido('r1', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('el chef del área correcta sí confirma', async () => {
    mocks.assertCan.mockResolvedValue(CTX_CALIENTE);
    mocks.findById.mockResolvedValue({
      id: 'r1',
      areaSolicitante: 'cocina_caliente',
      estado: 'despachada',
      version: 3,
    });
    mocks.transition.mockResolvedValue({ id: 'r1', estado: 'recibida', version: 4 });
    const r = await confirmarRecibido('r1', 3);
    expect(r.ok).toBe(true);
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      't1',
      'sala:almacen',
      expect.objectContaining({ type: 'REQUISICION_ESTADO' }),
    );
  });
});

describe('cancelarRequisicion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('NOT_FOUND cuando la requisición no existe', async () => {
    mocks.assertCan.mockResolvedValue(CTX_CALIENTE);
    mocks.findById.mockResolvedValue(null);
    const r = await cancelarRequisicion('rX', 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
  });
});

describe('getColaAlmacen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista la cola para almacén', async () => {
    mocks.assertCan.mockResolvedValue(CTX_ALMACEN);
    mocks.findColaAlmacen.mockResolvedValue([]);
    const r = await getColaAlmacen();
    expect(r.ok).toBe(true);
    expect(mocks.findColaAlmacen).toHaveBeenCalledWith('t1');
  });
});
