import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock encadenable que resuelve por tabla. Cada método devuelve el mismo chain;
// el chain es "thenable" y resuelve el resultado preconfigurado de su tabla.
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  emitEvent: vi.fn(async () => {}),
  reqsResult: { data: [] as unknown[] },
  alertasPreviasResult: { data: [] as unknown[] },
}));

function chainResolving(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'lt', 'gte', 'order']) {
    chain[m] = () => chain;
  }
  // Thenable: await sobre el chain resuelve el resultado de la tabla.
  chain['then'] = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'requisiciones'
        ? chainResolving(mocks.reqsResult)
        : chainResolving(mocks.alertasPreviasResult),
  }),
}));

vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));

vi.mock('../infrastructure/alerta-repository', () => ({
  createAlertaRepository: () => ({
    create: mocks.create,
  }),
}));

import { runCheckRequisicionesSinDespachar } from '../infrastructure/checks';

describe('runCheckRequisicionesSinDespachar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.alertasPreviasResult = { data: [] };
    mocks.create.mockImplementation(async (tenantId: string, input: Record<string, unknown>) => ({
      id: 'a1',
      tenantId,
      tenantNombre: null,
      tenantSlug: null,
      ...input,
      leida: false,
      leidaAt: null,
      createdAt: new Date(),
    }));
  });

  it('genera una alerta por requisición demorada sin alerta previa', async () => {
    mocks.reqsResult = {
      data: [
        { id: 'r1', area_solicitante: 'cocina_caliente', solicitada_at: '2020-01-01T00:00:00Z' },
      ],
    };
    const n = await runCheckRequisicionesSinDespachar('t1', 20);
    expect(n).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        tipo: 'requisicion_demora',
        resourceTipo: 'requisicion',
        resourceId: 'r1',
      }),
    );
  });

  it('no genera alerta si ya existe una sin leer para esa requisición', async () => {
    mocks.reqsResult = {
      data: [{ id: 'r1', area_solicitante: 'amex', solicitada_at: '2020-01-01T00:00:00Z' }],
    };
    mocks.alertasPreviasResult = { data: [{ resource_id: 'r1' }] };
    const n = await runCheckRequisicionesSinDespachar('t1', 20);
    expect(n).toBe(0);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('retorna 0 cuando no hay requisiciones demoradas', async () => {
    mocks.reqsResult = { data: [] };
    const n = await runCheckRequisicionesSinDespachar('t1', 20);
    expect(n).toBe(0);
  });
});
