import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- hoisted mocks -----------------------------------------------------------

const mocks = vi.hoisted(() => ({
  assertCan: vi.fn(),
  auditLog: vi.fn(async () => {}),
  repoCreate: vi.fn(),
  // Supabase builder chain for the receta guard lookup
  maybeSingle: vi.fn(),
  is: vi.fn(),
  eqTenant: vi.fn(),
  eqReceta: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));
vi.mock('@/modules/production/infrastructure/production-repository', () => ({
  createProductionRepository: () => ({
    create: mocks.repoCreate,
    findAll: vi.fn(),
    findByIdWithIngredientes: vi.fn(),
    updateEstado: vi.fn(),
    findCompletadasByZona: vi.fn(),
  }),
}));

import { createTanda } from '@/modules/production/actions';

// ---- helpers -----------------------------------------------------------------

const CTX = { tenantId: 't1', userId: 'u1', role: 'admin' };

const VALID_INPUT = {
  recetaId: '11111111-1111-1111-1111-111111111111',
  cantidadTandas: 2,
  zonaDestino: 'snack' as const,
  idempotencyKey: 'key-test-001',
};

/** Build a mock Supabase builder that returns `receta` from maybeSingle(). */
function mockSupabaseReceta(receta: { tipo_receta: string } | null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: receta, error: null }),
  };
  mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(builder) });
  return builder;
}

// ---- tests -------------------------------------------------------------------

describe('createTanda action — guard tipo_receta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  it('receta tipo servicio → result.ok false, código VALIDATION, repo.create NO llamado', async () => {
    mockSupabaseReceta({ tipo_receta: 'servicio' });

    const result = await createTanda(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.httpStatus).toBe(422);
    }
    expect(mocks.repoCreate).not.toHaveBeenCalled();
  });

  it('receta no encontrada (null) → result.ok false, código NOT_FOUND, repo.create NO llamado', async () => {
    mockSupabaseReceta(null);

    const result = await createTanda(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.httpStatus).toBe(404);
    }
    expect(mocks.repoCreate).not.toHaveBeenCalled();
  });

  it('receta tipo produccion → procede y repo.create es llamado', async () => {
    mockSupabaseReceta({ tipo_receta: 'produccion' });

    const tanda = {
      id: 'tanda-x',
      tenantId: 't1',
      recetaId: VALID_INPUT.recetaId,
      recetaNombre: 'Pan',
      cantidadTandas: 2,
      estado: 'planificada' as const,
      zonaDestino: 'snack' as const,
      pedidoItemId: null,
      responsableId: 'u1',
      responsableNombre: null,
      turnoId: null,
      turnoNombre: null,
      notas: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mocks.repoCreate.mockResolvedValue(tanda);

    const result = await createTanda(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(mocks.repoCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog).toHaveBeenCalled();
  });
});
