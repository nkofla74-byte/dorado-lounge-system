import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const order = vi.fn();
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order,
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return {
    assertCan: vi.fn(),
    auditLog: vi.fn(async () => {}),
    emitEvent: vi.fn(async () => {}),
    chain,
    order,
    from: vi.fn(() => chain),
  };
});

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({}),
}));

import { getCartaElaboraciones } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'personal_buffet' };

describe('getCartaElaboraciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  it('devuelve recetas tipo produccion de las áreas permitidas para la zona', async () => {
    mocks.order.mockResolvedValue({
      data: [
        { id: 'r1', nombre: 'Arroz blanco', area_produccion: 'cocina_caliente', porciones: 1 },
      ],
      error: null,
    });

    const result = await getCartaElaboraciones('buffet');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { id: 'r1', nombre: 'Arroz blanco', area: 'cocina_caliente', porciones: 1 },
      ]);
    }
    expect(mocks.assertCan).toHaveBeenCalledWith('recipes:read');
    expect(mocks.chain.eq).toHaveBeenCalledWith('tipo_receta', 'produccion');
    expect(mocks.chain.in).toHaveBeenCalledWith('area_produccion', [
      'cocina_caliente',
      'cocina_fria',
      'pasteleria',
    ]);
  });

  it('rechaza una zona inválida', async () => {
    const result = await getCartaElaboraciones('plaza' as never);
    expect(result.ok).toBe(false);
  });

  it('catálogo vacío devuelve lista vacía sin error', async () => {
    mocks.order.mockResolvedValue({ data: [], error: null });
    const result = await getCartaElaboraciones('buffet');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('rechaza la zona de otro rol de zona', async () => {
    const result = await getCartaElaboraciones('snack');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
