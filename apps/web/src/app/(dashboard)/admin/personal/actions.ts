'use server';

import { z } from 'zod';
import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createSuperuserRepository } from '@/modules/superuser/infrastructure/superuser-repository';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Result } from '@/lib/result';
import type { TenantUser } from '@/modules/superuser/domain/superuser';

// superuser excludido — admins no pueden escalar privilegios
const adminRoleSchema = z.enum([
  'admin',
  'chef',
  'sous_chef',
  'mesero_amex',
  'recepcion',
  'personal_snack',
  'personal_buffet',
  'personal_almacen',
  'personal_pasteleria',
  'steward',
]);

const crearPersonalSchema = z.object({
  nombre: z.string().min(2, 'Nombre muy corto').max(100, 'Nombre muy largo'),
  email: z.string().email('Email inválido'),
  role: adminRoleSchema,
  password: z.string().min(8, 'Contraseña mínimo 8 caracteres').max(100, 'Contraseña muy larga'),
});

export type CrearPersonalFormInput = z.infer<typeof crearPersonalSchema>;

// Verifica que el userId objetivo pertenece al tenant del admin que opera
async function assertUserInTenant(userId: string, tenantId: string): Promise<void> {
  const { data } = await createAdminClient()
    .from('users')
    .select('tenant_id')
    .eq('id', userId)
    .single();
  if (!data || data.tenant_id !== tenantId) {
    throw new Error('El usuario no pertenece a tu organización');
  }
}

export async function getPersonal(): Promise<Result<TenantUser[]>> {
  try {
    const ctx = await assertCan('users:write');
    const repo = createSuperuserRepository();
    const users = await repo.listUsers(ctx.tenantId);
    return ok(users.filter((u) => u.role !== 'superuser'));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function crearPersonal(input: unknown): Promise<Result<TenantUser>> {
  try {
    const ctx = await assertCan('users:write');
    const parsed = crearPersonalSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }
    const repo = createSuperuserRepository();
    const user = await repo.createUser({
      tenantId: ctx.tenantId,
      nombre: parsed.data.nombre,
      email: parsed.data.email,
      role: parsed.data.role,
      password: parsed.data.password,
    });
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'user.created',
      resourceType: 'user',
      resourceId: user.id,
      payload: { email: user.email, role: user.role },
    });
    return ok(user);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function togglePersonal(userId: string, activo: boolean): Promise<Result<TenantUser>> {
  try {
    const ctx = await assertCan('users:write');
    await assertUserInTenant(userId, ctx.tenantId);
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

export async function cambiarRolPersonal(
  userId: string,
  roleRaw: unknown,
): Promise<Result<TenantUser>> {
  try {
    const ctx = await assertCan('users:write');
    const parsed = adminRoleSchema.safeParse(roleRaw);
    if (!parsed.success) {
      return err(toAppError(new Error('Rol inválido')));
    }
    await assertUserInTenant(userId, ctx.tenantId);
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
