import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCan: vi.fn(),
  auditLog: vi.fn(async () => {}),
  emitEvent: vi.fn(async () => {}),
  findActiveByZona: vi.fn(),
  findByTurnoZona: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ is: () => ({ maybeSingle: mocks.maybeSingle }) }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({
    findActiveByZona: mocks.findActiveByZona,
    findByTurnoZona: mocks.findByTurnoZona,
  }),
}));

import { getPedidosZona, getPedidosTurnoZona } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'personal_snack' };

describe('pedidos por zona', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  it('getPedidosZona delega en findActiveByZona', async () => {
    mocks.findActiveByZona.mockResolvedValue([]);
    const result = await getPedidosZona('snack');
    expect(result.ok).toBe(true);
    expect(mocks.findActiveByZona).toHaveBeenCalledWith('t1', 'snack');
  });

  it('getPedidosTurnoZona resuelve el turno activo y filtra por él', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'turno-9' } });
    mocks.findByTurnoZona.mockResolvedValue([]);
    const result = await getPedidosTurnoZona('buffet');
    expect(result.ok).toBe(true);
    expect(mocks.findByTurnoZona).toHaveBeenCalledWith('t1', 'turno-9', 'buffet');
  });

  it('getPedidosTurnoZona sin turno activo devuelve lista vacía', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    const result = await getPedidosTurnoZona('buffet');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
    expect(mocks.findByTurnoZona).not.toHaveBeenCalled();
  });
});
