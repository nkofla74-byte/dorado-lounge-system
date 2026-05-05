import { describe, it, expect, vi } from 'vitest';
import { validarSlug, TenantSlugInvalidoError } from '../domain/superuser';
import { createTenant } from '../application/create-tenant';
import { getTenants, getTenant } from '../application/get-tenants';
import { getUsers } from '../application/get-users';
import type { Tenant, TenantUser } from '../domain/superuser';
import type { SuperuserRepository } from '../application/ports/superuser-repository.port';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    nombre: 'Dorado Lounge',
    slug: 'dorado-lounge',
    activo: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeUser(overrides: Partial<TenantUser> = {}): TenantUser {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    nombre: 'María García',
    email: 'maria@ejemplo.com',
    role: 'admin',
    activo: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<SuperuserRepository> = {}): SuperuserRepository {
  return {
    listTenants: vi.fn().mockResolvedValue([]),
    getTenant: vi.fn().mockResolvedValue(null),
    createTenant: vi.fn().mockResolvedValue(makeTenant()),
    toggleTenant: vi.fn().mockResolvedValue(makeTenant()),
    listUsers: vi.fn().mockResolvedValue([]),
    createUser: vi.fn().mockResolvedValue(makeUser()),
    toggleUser: vi.fn().mockResolvedValue(makeUser()),
    updateUserRole: vi.fn().mockResolvedValue(makeUser()),
    ...overrides,
  };
}

// ── validarSlug — función pura ────────────────────────────────────────────────

describe('validarSlug', () => {
  it('acepta slugs válidos de letras minúsculas y guiones', () => {
    expect(() => validarSlug('dorado-lounge')).not.toThrow();
    expect(() => validarSlug('abc')).not.toThrow();
    expect(() => validarSlug('lounge-el-dorado-bog')).not.toThrow();
  });

  it('acepta slug con números', () => {
    expect(() => validarSlug('lounge-123')).not.toThrow();
    expect(() => validarSlug('t01')).not.toThrow();
  });

  it('rechaza slug con mayúsculas', () => {
    expect(() => validarSlug('Dorado')).toThrow(TenantSlugInvalidoError);
  });

  it('rechaza slug con espacios', () => {
    expect(() => validarSlug('dorado lounge')).toThrow(TenantSlugInvalidoError);
  });

  it('rechaza slug con caracteres especiales', () => {
    expect(() => validarSlug('dorado_lounge')).toThrow(TenantSlugInvalidoError);
    expect(() => validarSlug('dorado.lounge')).toThrow(TenantSlugInvalidoError);
  });

  it('rechaza slug de menos de 3 caracteres', () => {
    expect(() => validarSlug('ab')).toThrow(TenantSlugInvalidoError);
  });

  it('rechaza slug de más de 32 caracteres', () => {
    expect(() => validarSlug('a'.repeat(33))).toThrow(TenantSlugInvalidoError);
  });

  it('acepta slug exactamente de 3 y 32 caracteres', () => {
    expect(() => validarSlug('abc')).not.toThrow();
    expect(() => validarSlug('a'.repeat(32))).not.toThrow();
  });

  it('el error incluye el slug inválido en el mensaje', () => {
    try {
      validarSlug('BAD SLUG!');
    } catch (e) {
      expect(e).toBeInstanceOf(TenantSlugInvalidoError);
      expect((e as TenantSlugInvalidoError).message).toContain('BAD SLUG!');
    }
  });
});

// ── TenantSlugInvalidoError ───────────────────────────────────────────────────

describe('TenantSlugInvalidoError', () => {
  it('es instancia de Error', () => {
    expect(new TenantSlugInvalidoError('msg')).toBeInstanceOf(Error);
  });

  it('tiene name correcto', () => {
    expect(new TenantSlugInvalidoError('msg').name).toBe('TenantSlugInvalidoError');
  });

  it('preserva el mensaje', () => {
    expect(new TenantSlugInvalidoError('slug inválido').message).toBe('slug inválido');
  });
});

// ── createTenant (use case) ───────────────────────────────────────────────────

describe('createTenant', () => {
  it('llama repo.createTenant con nombre y slug validado', async () => {
    const repo = makeRepo();
    await createTenant(repo, 'Dorado Lounge', 'dorado-lounge');
    expect(repo.createTenant).toHaveBeenCalledWith('Dorado Lounge', 'dorado-lounge');
  });

  it('devuelve el tenant creado por el repositorio', async () => {
    const tenant = makeTenant({ nombre: 'Mi Lounge', slug: 'mi-lounge' });
    const repo = makeRepo({ createTenant: vi.fn().mockResolvedValue(tenant) });
    const result = await createTenant(repo, 'Mi Lounge', 'mi-lounge');
    expect(result).toBe(tenant);
  });

  it('lanza TenantSlugInvalidoError para slug inválido sin llamar al repo', async () => {
    const repo = makeRepo();
    await expect(createTenant(repo, 'Lounge', 'INVALID SLUG')).rejects.toThrow(
      TenantSlugInvalidoError,
    );
    expect(repo.createTenant).not.toHaveBeenCalled();
  });
});

// ── getTenants (use case) ─────────────────────────────────────────────────────

describe('getTenants', () => {
  it('delega a repo.listTenants', async () => {
    const tenants = [makeTenant(), makeTenant({ id: 'tenant-2', slug: 'otro-tenant' })];
    const repo = makeRepo({ listTenants: vi.fn().mockResolvedValue(tenants) });
    const result = await getTenants(repo);
    expect(repo.listTenants).toHaveBeenCalledOnce();
    expect(result).toBe(tenants);
  });

  it('devuelve lista vacía si no hay tenants', async () => {
    const repo = makeRepo({ listTenants: vi.fn().mockResolvedValue([]) });
    const result = await getTenants(repo);
    expect(result).toHaveLength(0);
  });
});

// ── getTenant (use case) ──────────────────────────────────────────────────────

describe('getTenant', () => {
  it('delega a repo.getTenant con el id correcto', async () => {
    const tenant = makeTenant();
    const repo = makeRepo({ getTenant: vi.fn().mockResolvedValue(tenant) });
    const result = await getTenant(repo, 'tenant-1');
    expect(repo.getTenant).toHaveBeenCalledWith('tenant-1');
    expect(result).toBe(tenant);
  });

  it('devuelve null si el tenant no existe', async () => {
    const repo = makeRepo({ getTenant: vi.fn().mockResolvedValue(null) });
    const result = await getTenant(repo, 'no-existe');
    expect(result).toBeNull();
  });
});

// ── getUsers (use case) ───────────────────────────────────────────────────────

describe('getUsers', () => {
  it('delega a repo.listUsers con tenantId cuando se provee', async () => {
    const users = [makeUser(), makeUser({ id: 'user-2', email: 'otro@ejemplo.com' })];
    const repo = makeRepo({ listUsers: vi.fn().mockResolvedValue(users) });
    const result = await getUsers(repo, 'tenant-1');
    expect(repo.listUsers).toHaveBeenCalledWith('tenant-1');
    expect(result).toBe(users);
  });

  it('delega a repo.listUsers sin tenantId cuando no se provee', async () => {
    const repo = makeRepo({ listUsers: vi.fn().mockResolvedValue([]) });
    await getUsers(repo);
    expect(repo.listUsers).toHaveBeenCalledWith(undefined);
  });

  it('devuelve lista vacía para tenant sin usuarios', async () => {
    const repo = makeRepo({ listUsers: vi.fn().mockResolvedValue([]) });
    const result = await getUsers(repo, 'tenant-nuevo');
    expect(result).toHaveLength(0);
  });
});
