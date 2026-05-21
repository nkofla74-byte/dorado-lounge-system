'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { convertirCantidad, UnitConversionError } from '@/lib/units';
import { createRecipeRepository } from './infrastructure/recipe-repository';
import { getRecetas as getRecetasUseCase } from './application/get-recipes';
import { createReceta as createRecetaUseCase } from './application/create-recipe';
import { addIngrediente as addIngredienteUseCase } from './application/add-ingrediente';
import {
  createRecetaSchema,
  addIngredienteSchema,
  updateRecetaMenuSchema,
} from '@dorado/shared-validation';
import type { Result } from '@/lib/result';
import type { UnidadMedida } from '@dorado/shared-types';
import type { Receta, RecetaIngrediente, RecetaWithIngredientes } from './domain/recipe';

/**
 * Carga la unidad base de cada insumo dado un set de IDs.
 * Devuelve un mapa insumoId → unidad_medida. Si falta alguno, su entrada queda undefined.
 */
async function loadInsumosUnidadBase(
  tenantId: string,
  insumoIds: string[],
): Promise<Map<string, UnidadMedida>> {
  if (insumoIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('insumos')
    .select('id, unidad_medida')
    .eq('tenant_id', tenantId)
    .in('id', insumoIds);
  if (error) throw new AppError('DB_ERROR', 500, error.message);
  const m = new Map<string, UnidadMedida>();
  for (const row of (data ?? []) as Array<{ id: string; unidad_medida: string }>) {
    m.set(row.id, row.unidad_medida as UnidadMedida);
  }
  return m;
}

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

    // Si vinieron ingredientes inline, los inserto en secuencia.
    // No es transaccional: si falla alguno la receta queda creada y el usuario
    // puede completar los faltantes desde el sheet de ingredientes.
    const ingredientes = parsed.data.ingredientes ?? [];
    // Cargo unidades base de los insumos para convertir cantidades cuando el
    // usuario eligió una unidad de display distinta a la del insumo.
    const insumoIds = ingredientes.map((i) => i.insumoId);
    const unidadesBase = await loadInsumosUnidadBase(ctx.tenantId, insumoIds);
    const ingredientesFallidos: string[] = [];
    for (const ing of ingredientes) {
      try {
        const base = unidadesBase.get(ing.insumoId);
        if (!base) throw new AppError('NOT_FOUND', 404, 'Insumo no encontrado');
        const unidadInput = ing.unidad ?? base;
        const cantidadBase = convertirCantidad(ing.cantidad, unidadInput, base);
        await addIngredienteUseCase(repo, ctx.tenantId, {
          recetaId: receta.id,
          insumoId: ing.insumoId,
          cantidad: cantidadBase,
          unidadDisplay: ing.unidad ?? null,
          mermaCoeficiente: ing.mermaCoeficiente,
        });
      } catch (ingErr) {
        const msg =
          ingErr instanceof UnitConversionError ? ingErr.message : toAppError(ingErr).message;
        ingredientesFallidos.push(msg);
      }
    }

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'recipes:create_receta',
      resourceId: receta.id,
      resourceType: 'receta',
      payload: {
        nombre: receta.nombre,
        tipoReceta: receta.tipoReceta,
        ingredientesAgregados: ingredientes.length - ingredientesFallidos.length,
        ingredientesFallidos: ingredientesFallidos.length,
      },
    });

    if (ingredientesFallidos.length > 0) {
      return err(
        toAppError(
          new Error(
            `Receta creada pero ${ingredientesFallidos.length} ingrediente(s) fallaron: ${ingredientesFallidos.join('; ')}`,
          ),
        ),
      );
    }

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
    const unidadesBase = await loadInsumosUnidadBase(ctx.tenantId, [parsed.data.insumoId]);
    const base = unidadesBase.get(parsed.data.insumoId);
    if (!base) {
      return err(toAppError(new AppError('NOT_FOUND', 404, 'Insumo no encontrado')));
    }
    const unidadInput = parsed.data.unidad ?? base;
    const cantidadBase = convertirCantidad(parsed.data.cantidad, unidadInput, base);
    const ingrediente = await addIngredienteUseCase(repo, ctx.tenantId, {
      recetaId: parsed.data.recetaId,
      insumoId: parsed.data.insumoId,
      cantidad: cantidadBase,
      unidadDisplay: parsed.data.unidad ?? null,
      mermaCoeficiente: parsed.data.mermaCoeficiente,
    });

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

export async function updateRecetaMenuMeta(input: unknown): Promise<Result<void>> {
  try {
    const ctx = await assertCan('recipes:write');

    const parsed = updateRecetaMenuSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createRecipeRepository();
    await repo.updateMenuMeta(ctx.tenantId, parsed.data);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'recipes:update_menu_meta',
      resourceId: parsed.data.recetaId,
      resourceType: 'receta',
      payload: { categoriaMenu: parsed.data.categoriaMenu, descripcion: parsed.data.descripcion },
    });

    return ok(undefined);
  } catch (e) {
    return err(toAppError(e));
  }
}
