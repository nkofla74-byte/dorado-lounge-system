'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createSuperuserRepository } from './infrastructure/superuser-repository';
import { getTenants as getTenantsFn, getTenant as getTenantFn } from './application/get-tenants';
import { createTenant as createTenantFn } from './application/create-tenant';
import { getUsers as getUsersFn } from './application/get-users';
import { createUser as createUserFn } from './application/create-user';
import { crearTenantSchema, crearUsuarioSchema, userRoleSchema } from '@dorado/shared-validation';
import { TenantSlugInvalidoError } from './domain/superuser';
import type { Result } from '@/lib/result';
import type { Tenant, TenantUser } from './domain/superuser';

export async function getTenants(): Promise<Result<Tenant[]>> {
  try {
    await assertCan('tenants:read');
    const repo = createSuperuserRepository();
    return ok(await getTenantsFn(repo));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTenantById(tenantId: string): Promise<Result<Tenant | null>> {
  try {
    await assertCan('tenants:read');
    const repo = createSuperuserRepository();
    return ok(await getTenantFn(repo, tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function crearTenant(input: unknown): Promise<Result<Tenant>> {
  try {
    const ctx = await assertCan('tenants:write');
    const parsed = crearTenantSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }
    const repo = createSuperuserRepository();
    const tenant = await createTenantFn(repo, parsed.data.nombre, parsed.data.slug);
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'tenant.created',
      resourceType: 'tenant',
      resourceId: tenant.id,
      payload: { nombre: tenant.nombre, slug: tenant.slug },
    });
    return ok(tenant);
  } catch (e) {
    if (e instanceof TenantSlugInvalidoError) {
      return err(toAppError(new Error(e.message)));
    }
    return err(toAppError(e));
  }
}

export async function toggleTenant(tenantId: string, activo: boolean): Promise<Result<Tenant>> {
  try {
    const ctx = await assertCan('tenants:write');
    const repo = createSuperuserRepository();
    const tenant = await repo.toggleTenant(tenantId, activo);
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: activo ? 'tenant.activated' : 'tenant.deactivated',
      resourceType: 'tenant',
      resourceId: tenantId,
    });
    return ok(tenant);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getUsers(tenantId?: string): Promise<Result<TenantUser[]>> {
  try {
    await assertCan('users:read');
    const repo = createSuperuserRepository();
    return ok(await getUsersFn(repo, tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function crearUsuario(input: unknown): Promise<Result<TenantUser>> {
  try {
    const ctx = await assertCan('tenants:write');
    const parsed = crearUsuarioSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }
    const repo = createSuperuserRepository();
    const user = await createUserFn(repo, parsed.data);
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'user.created',
      resourceType: 'user',
      resourceId: user.id,
      payload: { email: user.email, role: user.role, tenantId: user.tenantId },
    });
    return ok(user);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function toggleUser(userId: string, activo: boolean): Promise<Result<TenantUser>> {
  try {
    const ctx = await assertCan('tenants:write');
    const repo = createSuperuserRepository();
    const user = await repo.toggleUser(userId, activo);
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: activo ? 'user.activated' : 'user.deactivated',
      resourceType: 'user',
      resourceId: userId,
    });
    return ok(user);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function cambiarRolUsuario(
  userId: string,
  roleRaw: unknown,
): Promise<Result<TenantUser>> {
  try {
    const ctx = await assertCan('tenants:write');
    const parsed = userRoleSchema.safeParse(roleRaw);
    if (!parsed.success) {
      return err(toAppError(new Error('Rol inválido')));
    }
    const repo = createSuperuserRepository();
    const user = await repo.updateUserRole(userId, parsed.data);
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'user.role_updated',
      resourceType: 'user',
      resourceId: userId,
      payload: { newRole: parsed.data },
    });
    return ok(user);
  } catch (e) {
    return err(toAppError(e));
  }
}
