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

import { entregarPedido } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'mesero_amex' };

describe('entregarPedido (actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  const pedidoListo = {
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
    items: [
      {
        id: 'i1',
        pedidoId: 'p1',
        recetaId: 'r1',
        recetaNombre: 'Pan',
        cantidad: 2,
        notas: null,
        areaProduccion: 'amex',
        estado: 'listo',
        enPreparacionAt: null,
        listoAt: null,
        iniciadoPor: null,
        listoPor: null,
        recetaPorciones: 4,
        recetaTipo: 'servicio',
        ingredientes: [
          { insumoId: 'ins1', insumoNombre: 'Pan', cantidadPorBatch: 100, mermaCoeficiente: 0 },
        ],
      },
    ],
  };

  it('descuenta vía RPC FEFO con cantidad neta e idempotency key determinística', async () => {
    mocks.findByIdForDelivery.mockResolvedValue(pedidoListo);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.transition.mockResolvedValue({ id: 'p1', estado: 'entregado', updatedAt: new Date() });

    const result = await entregarPedido('p1', 7);

    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'fn_descontar_insumo_fefo',
      expect.objectContaining({
        p_tenant_id: 't1',
        p_insumo_id: 'ins1',
        p_cantidad: 50, // (100 / 4 porciones) * 2 pedidos
        p_idempotency_key: 'pedido:p1:item:i1:ing:ins1',
        p_tipo: 'salida_receta',
      }),
    );
    expect(mocks.transition).toHaveBeenCalledWith('p1', 't1', 'entregado', 7);
  });

  it('stock insuficiente (P0001) → STOCK_INSUFICIENTE y NO transiciona el pedido', async () => {
    mocks.findByIdForDelivery.mockResolvedValue(pedidoListo);
    mocks.rpc.mockResolvedValue({ error: { code: 'P0001', message: 'stock insuficiente' } });

    const result = await entregarPedido('p1', 7);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STOCK_INSUFICIENTE');
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('transición inválida no descuenta stock', async () => {
    mocks.findByIdForDelivery.mockResolvedValue({ ...pedidoListo, estado: 'creado' });

    const result = await entregarPedido('p1', 7);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_TRANSITION');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('entregar pedido de solo elaboraciones NO invoca fn_descontar_insumo_fefo', async () => {
    mocks.findByIdForDelivery.mockResolvedValue({
      id: 'p1',
      tenantId: 't1',
      numeroMesa: null,
      zona: 'buffet',
      estado: 'despachado',
      version: 4,
      notas: null,
      cocineroId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'i1',
          pedidoId: 'p1',
          recetaId: 'r1',
          recetaNombre: 'Arroz blanco',
          cantidad: 2,
          notas: null,
          areaProduccion: 'cocina_caliente',
          estado: 'listo',
          enPreparacionAt: null,
          listoAt: null,
          iniciadoPor: null,
          listoPor: null,
          recetaPorciones: 1,
          recetaTipo: 'produccion',
          ingredientes: [
            {
              insumoId: 'ins1',
              insumoNombre: 'Arroz',
              cantidadPorBatch: 5000,
              mermaCoeficiente: 0,
            },
          ],
        },
      ],
    });
    mocks.transition.mockResolvedValue({
      id: 'p1',
      estado: 'entregado',
      version: 5,
      updatedAt: new Date(),
    });

    const result = await entregarPedido('p1', 4);

    expect(result.ok).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.transition).toHaveBeenCalledWith('p1', 't1', 'entregado', 4);
  });
});
