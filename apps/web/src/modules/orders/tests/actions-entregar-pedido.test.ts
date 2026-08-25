import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tras F-008, la entrega es UNA transacción de Postgres (fn_entregar_pedido):
// descuento FEFO de todos los ingredientes + transición a 'entregado'.
//
// El cálculo de cantidades y las claves de idempotencia ya no viven aquí; se
// verifican contra una base real en scripts/sql-harness/tests/f008_entrega_atomica.sql,
// que es donde ahora se garantizan de forma atómica. Esta prueba cubre lo que
// sigue siendo responsabilidad de la Server Action: autorización, guarda de
// zona, delegación a la RPC, auditoría y broadcast.

const mocks = vi.hoisted(() => ({
  assertCan: vi.fn(),
  auditLog: vi.fn(async () => {}),
  emitEvent: vi.fn(async () => {}),
  insert: vi.fn(async () => ({ error: null })),
  findByIdForDelivery: vi.fn(),
  entregar: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({
    findByIdForDelivery: mocks.findByIdForDelivery,
    entregar: mocks.entregar,
    transition: mocks.transition,
  }),
}));

import { entregarPedido, cancelarPedido } from '@/modules/orders/actions';
import { AppError } from '@/lib/result';

const CTX = { tenantId: 't1', userId: 'u1', role: 'mesero_amex' };

function pedido(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    tenantId: 't1',
    estado: 'despachado',
    zona: 'amex',
    version: 7,
    numeroMesa: null,
    notas: null,
    cocineroId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    ...overrides,
  };
}

describe('entregarPedido (actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
    mocks.findByIdForDelivery.mockResolvedValue(pedido());
    mocks.entregar.mockResolvedValue({ ...pedido({ estado: 'entregado', version: 8 }) });
  });

  it('delega la entrega en la RPC transaccional con la versión del cliente', async () => {
    const res = await entregarPedido('p1', 7);

    expect(res.ok).toBe(true);
    expect(mocks.entregar).toHaveBeenCalledWith('p1', 't1', 7);
  });

  it('no invoca la RPC si el pedido no admite la transición a entregado', async () => {
    mocks.findByIdForDelivery.mockResolvedValue(pedido({ estado: 'creado' }));

    const res = await entregarPedido('p1', 7);

    expect(res.ok).toBe(false);
    expect(mocks.entregar).not.toHaveBeenCalled();
  });

  it('rechaza a un rol de zona operando una zona ajena', async () => {
    mocks.assertCan.mockResolvedValue({ ...CTX, role: 'personal_snack' });
    mocks.findByIdForDelivery.mockResolvedValue(pedido({ zona: 'buffet' }));

    const res = await entregarPedido('p1', 7);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
    expect(mocks.entregar).not.toHaveBeenCalled();
  });

  it('propaga STOCK_INSUFICIENTE sin auditar ni difundir', async () => {
    mocks.entregar.mockRejectedValue(
      new AppError('STOCK_INSUFICIENTE', 409, 'Stock insuficiente para insumo X'),
    );

    const res = await entregarPedido('p1', 7);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('STOCK_INSUFICIENTE');
    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('propaga el conflicto de versión de la RPC', async () => {
    mocks.entregar.mockRejectedValue(new AppError('VERSION_CONFLICT', 409, 'conflicto'));

    const res = await entregarPedido('p1', 7);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VERSION_CONFLICT');
  });

  it('audita y difunde a cocina y a la zona tras entregar', async () => {
    await entregarPedido('p1', 7);

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'orders:entregar_pedido', resourceId: 'p1' }),
    );
    expect(mocks.emitEvent).toHaveBeenCalledTimes(2);
  });
});

describe('cancelarPedido (actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
    mocks.findByIdForDelivery.mockResolvedValue(pedido({ estado: 'creado' }));
    mocks.transition.mockResolvedValue(pedido({ estado: 'cancelado', version: 8 }));
  });

  it('cancela vía la RPC de transición', async () => {
    const res = await cancelarPedido('p1', 7);

    expect(res.ok).toBe(true);
    expect(mocks.transition).toHaveBeenCalledWith('p1', 't1', 'cancelado', 7);
  });

  it('no cancela un pedido ya entregado', async () => {
    mocks.findByIdForDelivery.mockResolvedValue(pedido({ estado: 'entregado' }));

    const res = await cancelarPedido('p1', 7);

    expect(res.ok).toBe(false);
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});
