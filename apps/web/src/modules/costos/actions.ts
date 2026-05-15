'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { createCostosRepository } from './infrastructure/costos-repository';
import type { Result } from '@/lib/result';
import type { CostoReceta } from './domain/costo';

export async function getCostoReceta(recetaId: string): Promise<Result<CostoReceta | null>> {
  try {
    const ctx = await assertCan('recipes:read');
    const repo = createCostosRepository();
    return ok(await repo.getCostoReceta(ctx.tenantId, recetaId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getCostosRecetas(
  recetaIds: string[],
): Promise<Result<Record<string, CostoReceta>>> {
  try {
    const ctx = await assertCan('recipes:read');
    const repo = createCostosRepository();
    const map = await repo.getCostosRecetas(ctx.tenantId, recetaIds);
    return ok(Object.fromEntries(map.entries()));
  } catch (e) {
    return err(toAppError(e));
  }
}
