'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProductionRepository } from './infrastructure/production-repository';
import { getTandas as getTandasUseCase } from './application/get-tandas';
import { createTanda as createTandaUseCase } from './application/create-tanda';
import { createTandaSchema } from '@dorado/shared-validation';
import { cantidadConMerma } from '@/modules/inventory/domain/merma';
import { TANDA_TRANSITIONS } from './domain/tanda';
import type { Result } from '@/lib/result';
import type { Tanda } from './domain/tanda';

export async function getTandas(): Promise<Result<Tanda[]>> {
  try {
    const ctx = await assertCan('production:read');
    const repo = createProductionRepository();
    return ok(await getTandasUseCase(repo, ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createTanda(input: unknown): Promise<Result<Tanda>> {
  try {
    const ctx = await assertCan('production:write');

    const parsed = createTandaSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createProductionRepository();
    const tanda = await createTandaUseCase(repo, ctx.tenantId, {
      recetaId: parsed.data.recetaId,
      cantidadTandas: parsed.data.cantidadTandas,
      idempotencyKey: parsed.data.idempotencyKey,
      responsableId: ctx.userId,
      turnoId: parsed.data.turnoId ?? null,
      notas: parsed.data.notas ?? null,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'production:create_tanda',
      resourceId: tanda.id,
      resourceType: 'tanda',
      payload: {
        recetaId: tanda.recetaId,
        cantidadTandas: tanda.cantidadTandas,
        turnoId: tanda.turnoId,
        responsableId: tanda.responsableId,
      },
    });

    return ok(tanda);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function iniciarTanda(tandaId: string): Promise<Result<Tanda>> {
  try {
    const ctx = await assertCan('production:write');
    const repo = createProductionRepository();

    const tanda = await repo.findByIdWithIngredientes(tandaId, ctx.tenantId);
    if (!tanda) return err(new AppError('NOT_FOUND', 404, 'Tanda no encontrada'));

    if (!TANDA_TRANSITIONS[tanda.estado].includes('en_proceso')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede iniciar una tanda en estado '${tanda.estado}'`,
        ),
      );
    }

    const updated = await repo.updateEstado(tandaId, ctx.tenantId, 'en_proceso');

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'production:iniciar_tanda',
      resourceId: tandaId,
      resourceType: 'tanda',
      payload: {},
    });

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function completarTanda(tandaId: string): Promise<Result<Tanda>> {
  try {
    const ctx = await assertCan('production:write');
    const repo = createProductionRepository();

    const tanda = await repo.findByIdWithIngredientes(tandaId, ctx.tenantId);
    if (!tanda) return err(new AppError('NOT_FOUND', 404, 'Tanda no encontrada'));

    if (!TANDA_TRANSITIONS[tanda.estado].includes('completada')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede completar una tanda en estado '${tanda.estado}'`,
        ),
      );
    }

    // Descontar ingredientes via fn_descontar_insumo_fefo (SECURITY DEFINER, admin client).
    // La merma se aplica aquí: cantidad_a_descontar = cantidad_neta / (1 - coeficiente).
    if (tanda.ingredientes.length > 0) {
      const adminClient = createAdminClient();

      for (const ing of tanda.ingredientes) {
        const cantidadNeta = ing.cantidad * tanda.cantidadTandas;
        const cantidadBruta = cantidadConMerma(cantidadNeta, ing.mermaCoeficiente);
        const idempotencyKey = `tanda:${tandaId}:ing:${ing.insumoId}`;

        const { data, error } = await adminClient.rpc('fn_descontar_insumo_fefo', {
          p_tenant_id: ctx.tenantId,
          p_insumo_id: ing.insumoId,
          p_cantidad: cantidadBruta,
          p_idempotency_key: idempotencyKey,
          p_tipo: 'salida_receta',
          p_referencia_id: tandaId,
          p_referencia_tipo: 'tanda',
          p_usuario_id: ctx.userId,
        });

        if (error) {
          throw new AppError(
            'FEFO_ERROR',
            500,
            `Error al descontar stock de '${ing.insumoNombre}'. Intenta de nuevo.`,
          );
        }

        const rpcResult = data as { ok?: boolean; message?: string } | null;
        if (!rpcResult?.ok) {
          throw new AppError(
            'STOCK_INSUFICIENTE',
            409,
            `Stock insuficiente para: ${ing.insumoNombre}`,
          );
        }
      }
    }

    const updated = await repo.updateEstado(tandaId, ctx.tenantId, 'completada');

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'production:completar_tanda',
      resourceId: tandaId,
      resourceType: 'tanda',
      payload: { ingredientesDescontados: tanda.ingredientes.length },
    });

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function cancelarTanda(tandaId: string): Promise<Result<Tanda>> {
  try {
    const ctx = await assertCan('production:write');
    const repo = createProductionRepository();

    const tanda = await repo.findByIdWithIngredientes(tandaId, ctx.tenantId);
    if (!tanda) return err(new AppError('NOT_FOUND', 404, 'Tanda no encontrada'));

    if (!TANDA_TRANSITIONS[tanda.estado].includes('cancelada')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede cancelar una tanda en estado '${tanda.estado}'`,
        ),
      );
    }

    const updated = await repo.updateEstado(tandaId, ctx.tenantId, 'cancelada');

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'production:cancelar_tanda',
      resourceId: tandaId,
      resourceType: 'tanda',
      payload: {},
    });

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}
