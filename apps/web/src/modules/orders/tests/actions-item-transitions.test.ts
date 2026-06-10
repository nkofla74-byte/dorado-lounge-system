import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCan: vi.fn(),
  auditLog: vi.fn(async () => {}),
  emitEvent: vi.fn(async () => {}),
  rpc: vi.fn(),
  insert: vi.fn(async () => ({ error: null })),
  findItemForTransition: vi.fn(),
  transitionItem: vi.fn(),
  findByIdForDelivery: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({
    findItemForTransition: mocks.findItemForTransition,
    transitionItem: mocks.transitionItem,
    findByIdForDelivery: mocks.findByIdForDelivery,
    transition: mocks.transition,
  }),
}));

import { iniciarItem, recallItem } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'chef_cocina_fria' };

describe('transiciones de ítem KDS (actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  it('iniciarItem exige el permiso de escritura del área real del ítem', async () => {
    mocks.findItemForTransition.mockResolvedValue({
      itemId: 'i1',
      pedidoId: 'p1',
      area: 'cocina_fria',
      estado: 'pendiente',
      pedidoEstado: 'recibido_cocina',
      pedidoVersion: 3,
      zona: 'snack',
    });
    mocks.transitionItem.mockResolvedValue({ pedidoEstado: 'en_preparacion', pedidoVersion: 4 });

    const result = await iniciarItem('i1', 3);

    expect(result.ok).toBe(true);
    expect(mocks.assertCan).toHaveBeenCalledWith('cocina_fria:write');
    expect(mocks.transitionItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'i1', nuevoEstado: 'en_preparacion', pedidoVersion: 3 }),
    );
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('rechaza recall de un ítem cuyo pedido ya está cerrado', async () => {
    mocks.findItemForTransition.mockResolvedValue({
      itemId: 'i1',
      pedidoId: 'p1',
      area: 'cocina_fria',
      estado: 'listo',
      pedidoEstado: 'entregado',
      pedidoVersion: 5,
      zona: 'snack',
    });

    const result = await recallItem('i1', 5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_TRANSITION');
    expect(mocks.transitionItem).not.toHaveBeenCalled();
  });

  it('rechaza ítem sin área productiva asignada', async () => {
    mocks.findItemForTransition.mockResolvedValue({
      itemId: 'i1',
      pedidoId: 'p1',
      area: null,
      estado: 'pendiente',
      pedidoEstado: 'recibido_cocina',
      pedidoVersion: 1,
      zona: 'snack',
    });

    const result = await iniciarItem('i1', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});
