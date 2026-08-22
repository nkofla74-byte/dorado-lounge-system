import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regresión de F-003: la autorización se resolvía únicamente con los claims del
// JWT. Desactivar a un empleado ponía users.activo = false sin invalidar su
// token, así que conservaba acceso operativo completo mientras el navegador
// siguiera abierto. No había ninguna prueba sobre assertCan.

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    }),
  }),
}));

import { assertCan } from '../assertCan';

const USER_ID = 'u-1';
const TENANT = 't-1';

function sesion(role = 'chef_cocina_fria', tenantId = TENANT) {
  return { data: { user: { id: USER_ID, app_metadata: { role, tenant_id: tenantId } } } };
}

function perfil(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      activo: true,
      role: 'chef_cocina_fria',
      tenant_id: TENANT,
      deleted_at: null,
      ...overrides,
    },
  };
}

describe('assertCan — vigencia de la sesión (F-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue(sesion());
    mocks.maybeSingle.mockResolvedValue(perfil());
  });

  it('concede el permiso a un usuario activo con el rol adecuado', async () => {
    const ctx = await assertCan('cocina_fria:write');

    expect(ctx).toEqual({ userId: USER_ID, tenantId: TENANT, role: 'chef_cocina_fria' });
  });

  it('rechaza a un usuario desactivado aunque su JWT siga siendo válido', async () => {
    mocks.maybeSingle.mockResolvedValue(perfil({ activo: false }));

    await expect(assertCan('cocina_fria:write')).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
      httpStatus: 401,
    });
  });

  it('rechaza a un usuario con borrado lógico', async () => {
    mocks.maybeSingle.mockResolvedValue(perfil({ deleted_at: '2026-08-22T00:00:00Z' }));

    await expect(assertCan('cocina_fria:write')).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });

  it('rechaza si el usuario ya no existe', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });

    await expect(assertCan('cocina_fria:write')).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });

  it('rechaza un JWT con un rol anterior al cambio de permisos', async () => {
    mocks.getUser.mockResolvedValue(sesion('admin'));
    mocks.maybeSingle.mockResolvedValue(perfil({ role: 'chef_cocina_fria' }));

    await expect(assertCan('inventory:write')).rejects.toMatchObject({
      code: 'SESSION_STALE',
      httpStatus: 401,
    });
  });

  it('rechaza un JWT cuyo tenant no coincide con el del perfil', async () => {
    mocks.maybeSingle.mockResolvedValue(perfil({ tenant_id: 'otro-tenant' }));

    await expect(assertCan('cocina_fria:write')).rejects.toMatchObject({
      code: 'SESSION_STALE',
    });
  });
});

describe('assertCan — matriz de permisos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue(sesion());
    mocks.maybeSingle.mockResolvedValue(perfil());
  });

  it('rechaza sin sesión', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(assertCan('cocina_fria:write')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rechaza un JWT sin rol ni tenant', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID, app_metadata: {} } } });

    await expect(assertCan('cocina_fria:write')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
    });
  });

  it('rechaza un permiso que el rol no tiene', async () => {
    await expect(assertCan('recipes:write')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('rechaza un permiso desconocido en lugar de dejarlo pasar', async () => {
    await expect(assertCan('permiso:inexistente')).rejects.toMatchObject({
      code: 'UNKNOWN_PERMISSION',
      httpStatus: 500,
    });
  });

  it('superuser conserva el bypass pero sigue sujeto a la vigencia de sesión', async () => {
    mocks.getUser.mockResolvedValue(sesion('superuser'));
    mocks.maybeSingle.mockResolvedValue(perfil({ role: 'superuser' }));

    const ctx = await assertCan('tenants:write');
    expect(ctx.role).toBe('superuser');

    mocks.maybeSingle.mockResolvedValue(perfil({ role: 'superuser', activo: false }));
    await expect(assertCan('tenants:write')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });
});
