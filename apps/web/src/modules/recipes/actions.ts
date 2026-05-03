'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createRecipeRepository } from './infrastructure/recipe-repository';
import { getRecetas as getRecetasUseCase } from './application/get-recipes';
import { createReceta as createRecetaUseCase } from './application/create-recipe';
import { addIngrediente as addIngredienteUseCase } from './application/add-ingrediente';
import { createRecetaSchema, addIngredienteSchema } from '@dorado/shared-validation';
import type { Result } from '@/lib/result';
import type { Receta, RecetaIngrediente, RecetaWithIngredientes } from './domain/recipe';

export async function getRecetas(): Promise<Result<RecetaWithIngredientes[]>> {
  try {
    const ctx = await assertCan('recipes:read');
    const repo = createRecipeRepository();
    return ok(await getRecetasUseCase(repo, ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createReceta(input: unknown): Promise<Result<Receta>> {
  try {
    const ctx = await assertCan('recipes:write');

    const parsed = createRecetaSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createRecipeRepository();
    const receta = await createRecetaUseCase(repo, ctx.tenantId, parsed.data);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'recipes:create_receta',
      resourceId: receta.id,
      resourceType: 'receta',
      payload: { nombre: receta.nombre, tipoReceta: receta.tipoReceta },
    });

    return ok(receta);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function addIngredienteAReceta(input: unknown): Promise<Result<RecetaIngrediente>> {
  try {
    const ctx = await assertCan('recipes:write');

    const parsed = addIngredienteSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createRecipeRepository();
    const ingrediente = await addIngredienteUseCase(repo, ctx.tenantId, parsed.data);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'recipes:add_ingrediente',
      resourceId: parsed.data.recetaId,
      resourceType: 'receta',
      payload: { insumoId: ingrediente.insumoId, cantidad: ingrediente.cantidad },
    });

    return ok(ingrediente);
  } catch (e) {
    return err(toAppError(e));
  }
}
