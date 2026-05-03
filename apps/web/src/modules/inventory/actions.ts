'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createInsumoRepository } from './infrastructure/insumo-repository';
import { getInsumos as getInsumosUseCase } from './application/get-insumos';
import { createInsumo as createInsumoUseCase } from './application/create-insumo';
import { createInsumoSchema } from '@dorado/shared-validation';
import type { Result } from '@/lib/result';
import type { InsumoWithStock, Insumo } from './domain/insumo';

export async function getInsumos(): Promise<Result<InsumoWithStock[]>> {
  try {
    await assertCan('inventory:read');
    const repo = createInsumoRepository();
    return ok(await getInsumosUseCase(repo));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createInsumo(input: unknown): Promise<Result<Insumo>> {
  try {
    const ctx = await assertCan('inventory:write');

    const parsed = createInsumoSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createInsumoRepository();
    const insumo = await createInsumoUseCase(repo, ctx.tenantId, {
      ...parsed.data,
      codigo: parsed.data.codigo || null,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'inventory:create_insumo',
      resourceId: insumo.id,
      resourceType: 'insumo',
      payload: { nombre: insumo.nombre, capa: insumo.capa },
    });

    return ok(insumo);
  } catch (e) {
    return err(toAppError(e));
  }
}
