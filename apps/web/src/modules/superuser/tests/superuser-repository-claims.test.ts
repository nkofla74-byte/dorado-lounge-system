import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regresión de F-001 (auditoría forense 2026-08-22).
//
// `handle_new_user` copiaba raw_user_meta_data.role/tenant_id a app_metadata.
// user_metadata lo escribe el propio usuario en el signup, así que aprovisionar
// desde ahí convertía el alta de personal en un vector de escalada. Los claims
// de autorización solo pueden viajar por app_metadata, fijado server-side.

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  updateUserById: vi.fn(),
  getUserById: vi.fn(),
  deleteUser: vi.fn(),
  insertSingle: vi.fn(),
  updateSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: mocks.createUser,
        updateUserById: mocks.updateUserById,
        getUserById: mocks.getUserById,
        deleteUser: mocks.deleteUser,
      },
    },
    from: () => ({
      insert: () => ({ select: () => ({ single: mocks.insertSingle }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: mocks.updateSingle }) }) }),
    }),
  }),
}));

import { createSuperuserRepository } from '@/modules/superuser/infrastructure/superuser-repository';

const USER_ROW = {
  id: 'u-1',
  tenant_id: 't-1',
  nombre: 'Nuevo Chef',
  role: 'chef_cocina_fria',
  activo: true,
  created_at: '2026-08-22T00:00:00.000Z',
};

const INPUT = {
  tenantId: 't-1',
  nombre: 'Nuevo Chef',
  email: 'chef@dorado.test',
  role: 'chef_cocina_fria' as const,
  password: 'contrasena-larga',
};

describe('superuser-repository.createUser — claims de autorización (F-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mocks.insertSingle.mockResolvedValue({ data: USER_ROW, error: null });
  });

  it('fija role y tenant_id en app_metadata', async () => {
    await createSuperuserRepository().createUser(INPUT);

    const payload = mocks.createUser.mock.calls[0]?.[0];
    expect(payload.app_metadata).toEqual({ tenant_id: 't-1', role: 'chef_cocina_fria' });
  });

  it('nunca escribe role ni tenant_id en user_metadata', async () => {
    await createSuperuserRepository().createUser(INPUT);

    const payload = mocks.createUser.mock.calls[0]?.[0];
    expect(payload.user_metadata?.role).toBeUndefined();
    expect(payload.user_metadata?.tenant_id).toBeUndefined();
  });

  it('revierte el usuario de auth si falla el insert del perfil', async () => {
    mocks.insertSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(createSuperuserRepository().createUser(INPUT)).rejects.toThrow('boom');
    expect(mocks.deleteUser).toHaveBeenCalledWith('u-1');
  });
});

describe('superuser-repository.updateUserRole — propagación de claims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSingle.mockResolvedValue({ data: USER_ROW, error: null });
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: 'chef@dorado.test', app_metadata: { otra: 'cosa' } } },
    });
    mocks.updateUserById.mockResolvedValue({ data: null, error: null });
  });

  it('escribe el rol nuevo en app_metadata sin perder el tenant', async () => {
    await createSuperuserRepository().updateUserRole('u-1', 'sous_chef');

    expect(mocks.updateUserById).toHaveBeenCalledWith('u-1', {
      app_metadata: { otra: 'cosa', tenant_id: 't-1', role: 'sous_chef' },
    });
  });
});
