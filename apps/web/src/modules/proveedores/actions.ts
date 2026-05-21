'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createProveedorRepository } from './infrastructure/proveedor-repository';
import { getProveedores as getProveedoresUseCase } from './application/get-proveedores';
import { createProveedor as createProveedorUseCase } from './application/create-proveedor';
import { updateProveedor as updateProveedorUseCase } from './application/update-proveedor';
import { createProveedorSchema, updateProveedorSchema } from '@dorado/shared-validation';
import { ProveedorNotFoundError } from './domain/proveedor';
import type { Result } from '@/lib/result';
import type { Proveedor } from './domain/proveedor';
import type { LoteConInsumo } from './application/ports/proveedor-repository.port';

// Superuser ve cross-tenant; cualquier otro rol queda acotado a su tenant.
export async function getProveedores(): Promise<Result<Proveedor[]>> {
  try {
    const ctx = await assertCan('proveedores:read');
    const scope = ctx.role === 'superuser' ? null : ctx.tenantId;
    const repo = createProveedorRepository();
    return ok(await getProveedoresUseCase(repo, scope));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createProveedor(input: unknown): Promise<Result<Proveedor>> {
  try {
    const ctx = await assertCan('proveedores:write');

    const parsed = createProveedorSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createProveedorRepository();
    const proveedor = await createProveedorUseCase(repo, ctx.tenantId, parsed.data);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'proveedores:crear',
      resourceId: proveedor.id,
      resourceType: 'proveedor',
      payload: { nombre: proveedor.nombre },
    });

    return ok(proveedor);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function updateProveedor(id: string, input: unknown): Promise<Result<Proveedor>> {
  try {
    const ctx = await assertCan('proveedores:write');

    const parsed = updateProveedorSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const scope = ctx.role === 'superuser' ? null : ctx.tenantId;
    const repo = createProveedorRepository();
    const proveedor = await updateProveedorUseCase(repo, id, scope, parsed.data);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'proveedores:actualizar',
      resourceId: proveedor.id,
      resourceType: 'proveedor',
      payload: { nombre: proveedor.nombre },
    });

    return ok(proveedor);
  } catch (e) {
    if (e instanceof ProveedorNotFoundError) {
      return err(new AppError('NOT_FOUND', 404, e.message));
    }
    return err(toAppError(e));
  }
}

export async function getHistorialCompras(proveedorId: string): Promise<Result<LoteConInsumo[]>> {
  try {
    const ctx = await assertCan('proveedores:read');
    const scope = ctx.role === 'superuser' ? null : ctx.tenantId;
    const repo = createProveedorRepository();
    return ok(await repo.findLotesByProveedor(proveedorId, scope));
  } catch (e) {
    return err(toAppError(e));
  }
}
