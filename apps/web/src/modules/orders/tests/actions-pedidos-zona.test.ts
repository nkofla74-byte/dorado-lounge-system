import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn();
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: vi.fn(() => chain),
    eq: eq.mockImplementation(() => chain),
    is: vi.fn(() => chain),
    maybeSingle,
  });
  return {
    assertCan: vi.fn(),
    auditLog: vi.fn(async () => {}),
    emitEvent: vi.fn(async () => {}),
    findActiveByZona: vi.fn(),
    findByTurnoZona: vi.fn(),
    findRecetaAreas: vi.fn(),
    create: vi.fn(),
    maybeSingle,
    eq,
    chain,
  };
});

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: vi.fn(async () => ({ error: null })) }) }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => mocks.chain }),
}));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({
    findActiveByZona: mocks.findActiveByZona,
    findByTurnoZona: mocks.findByTurnoZona,
    findRecetaAreas: mocks.findRecetaAreas,
    create: mocks.create,
  }),
}));

import { getPedidosZona, getPedidosTurnoZona, createPedido } from '@/modules/orders/actions';

const CTX_SNACK = { tenantId: 't1', userId: 'u1', role: 'personal_snack' };
const CTX_ADMIN = { tenantId: 't1', userId: 'u-admin', role: 'admin' };

describe('pedidos por zona', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX_SNACK);
  });

  it('getPedidosZona delega en findActiveByZona', async () => {
    mocks.findActiveByZona.mockResolvedValue([]);
    const result = await getPedidosZona('snack');
    expect(result.ok).toBe(true);
    expect(mocks.findActiveByZona).toHaveBeenCalledWith('t1', 'snack');
  });

  it('getPedidosZona rechaza zona ajena al rol', async () => {
    const result = await getPedidosZona('buffet');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(mocks.findActiveByZona).not.toHaveBeenCalled();
  });

  it('getPedidosZona admin puede auditar cualquier zona', async () => {
    mocks.assertCan.mockResolvedValue(CTX_ADMIN);
    mocks.findActiveByZona.mockResolvedValue([]);
    const result = await getPedidosZona('buffet');
    expect(result.ok).toBe(true);
    expect(mocks.findActiveByZona).toHaveBeenCalledWith('t1', 'buffet');
  });

  it('getPedidosZona valida la zona con Zod', async () => {
    mocks.assertCan.mockResolvedValue(CTX_ADMIN);
    const result = await getPedidosZona('mostrador' as never);
    expect(result.ok).toBe(false);
    expect(mocks.findActiveByZona).not.toHaveBeenCalled();
  });

  it('getPedidosTurnoZona resuelve el turno activo DEL USUARIO y filtra por él', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'turno-9' } });
    mocks.findByTurnoZona.mockResolvedValue([]);
    const result = await getPedidosTurnoZona('snack');
    expect(result.ok).toBe(true);
    expect(mocks.findByTurnoZona).toHaveBeenCalledWith('t1', 'turno-9', 'snack');
    // 1 turno activo por (tenant, usuario) — la query DEBE filtrar por responsable_id
    expect(mocks.eq).toHaveBeenCalledWith('responsable_id', 'u1');
  });

  it('getPedidosTurnoZona sin turno activo devuelve lista vacía', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    const result = await getPedidosTurnoZona('snack');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
    expect(mocks.findByTurnoZona).not.toHaveBeenCalled();
  });

  it('getPedidosTurnoZona rechaza zona ajena al rol', async () => {
    const result = await getPedidosTurnoZona('amex');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(mocks.findByTurnoZona).not.toHaveBeenCalled();
  });
});

describe('createPedido — zona y turno', () => {
  const RECETA_ID = '11111111-1111-4111-8111-111111111111';
  const validInput = (zona: string) => ({
    zona,
    idempotencyKey: 'e2e-key-1',
    items: [{ recetaId: RECETA_ID, cantidad: 1 }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX_SNACK);
  });

  it('rechaza crear pedido en zona ajena al rol', async () => {
    const result = await createPedido(validInput('buffet'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('vincula el pedido al turno activo DEL USUARIO', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'turno-7' } });
    mocks.findRecetaAreas.mockResolvedValue({ [RECETA_ID]: 'cocina_caliente' });
    mocks.create.mockResolvedValue({
      id: 'p1',
      zona: 'snack',
      numeroMesa: null,
      createdAt: new Date(),
      items: [
        {
          recetaId: RECETA_ID,
          cantidad: 1,
          recetaNombre: 'Arepa',
          areaProduccion: 'cocina_caliente',
        },
      ],
    });

    const result = await createPedido(validInput('snack'));

    expect(result.ok).toBe(true);
    expect(mocks.eq).toHaveBeenCalledWith('responsable_id', 'u1');
    expect(mocks.create).toHaveBeenCalledWith(
      't1',
      'u1',
      expect.objectContaining({ turnoId: 'turno-7' }),
      expect.anything(),
    );
  });
});
