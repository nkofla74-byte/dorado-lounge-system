import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regresión de F-007 y F-018 (auditoría forense 2026-08-22). El camino QR no
// tenía ninguna prueba.
//
// F-007 — los ítems se insertaban sin `area_produccion`, así que no aparecían en
//   ninguna cola KDS y el pedido no podía avanzar más allá de 'creado'.
// F-018 — el menú público ignoraba `recetas.activo`: un plato marcado como
//   agotado por el chef seguía visible y pedible.

const mocks = vi.hoisted(() => ({
  verifyMesaToken: vi.fn(),
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, reset: 0 })),
  verifyTurnstile: vi.fn(async () => ({ ok: true })),
  headers: vi.fn(async () => new Headers()),
  select: vi.fn(),
  rpc: vi.fn(),
  emitEvent: vi.fn(async () => {}),
}));

vi.mock('@/lib/qr/token', () => ({ verifyMesaToken: mocks.verifyMesaToken }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('@/lib/turnstile/verify', () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'is', 'in', 'order', 'single']) {
        builder[m] = vi.fn(() => builder);
      }
      // `select` resuelve como thenable con lo que el test haya configurado.
      builder['then'] = (resolve: (v: unknown) => unknown) => resolve(mocks.select());
      builder['single'] = vi.fn(async () => mocks.select());
      return builder;
    },
  }),
}));

import { createPedidoFromQR } from '@/app/qr/[locale]/actions';

// El schema de creación exige UUID en recetaId.
const RECETA_FRIA = 'eeeeeeee-1111-4111-8111-111111111111';

const MESA = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  zona: 'amex' as const,
  mesaNumero: 'M1',
};

const INPUT = {
  token: 'token-valido',
  items: [{ recetaId: RECETA_FRIA, cantidad: 2 }],
  idempotencyKey: 'idem-1',
};

describe('createPedidoFromQR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['TURNSTILE_SECRET_KEY'];
    // mockResolvedValue sobrevive a clearAllMocks: reponer los valores por
    // defecto para que un caso no contamine al siguiente.
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 9, reset: 0 });
    mocks.verifyTurnstile.mockResolvedValue({ ok: true });
    mocks.verifyMesaToken.mockResolvedValue(MESA);
    mocks.select.mockResolvedValue({
      data: [{ id: RECETA_FRIA, area_produccion: 'cocina_fria' }],
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: 'ped-nuevo', error: null });
  });

  it('rutea cada ítem a su área productiva al crear el pedido', async () => {
    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(true);
    const payload = mocks.rpc.mock.calls[0]?.[1];
    expect(mocks.rpc.mock.calls[0]?.[0]).toBe('fn_crear_pedido_qr');
    expect(payload.p_items).toEqual([
      { receta_id: RECETA_FRIA, cantidad: 2, notas: null, area_produccion: 'cocina_fria' },
    ]);
  });

  it('rechaza el pedido si alguna receta no tiene área asignada', async () => {
    mocks.select.mockResolvedValue({
      data: [{ id: RECETA_FRIA, area_produccion: null }],
      error: null,
    });

    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rechaza un área que la zona de la mesa no puede solicitar', async () => {
    // La zona amex no puede pedir a cocina_caliente (ZONA_AREAS_PERMITIDAS).
    mocks.select.mockResolvedValue({
      data: [{ id: RECETA_FRIA, area_produccion: 'cocina_caliente' }],
      error: null,
    });

    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rechaza un plato desactivado por el chef (no lo devuelve la consulta)', async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });

    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/no son válidos/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rechaza un token de mesa inválido antes de tocar la base', async () => {
    mocks.verifyMesaToken.mockResolvedValue(null);

    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('respeta el rate limit por mesa', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, reset: 0 });

    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('exige Turnstile cuando el secreto está configurado', async () => {
    process.env['TURNSTILE_SECRET_KEY'] = 'secreto';

    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/anti-bot/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('devuelve el pedido existente si la clave de idempotencia se repite', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicado' } });
    mocks.select.mockResolvedValueOnce({
      data: [{ id: RECETA_FRIA, area_produccion: 'cocina_fria' }],
      error: null,
    });
    mocks.select.mockResolvedValueOnce({ data: { id: 'ped-existente' }, error: null });

    const res = await createPedidoFromQR(INPUT);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.pedidoId).toBe('ped-existente');
  });
});
