'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProductionRepository } from './infrastructure/production-repository';
import { createClient } from '@/lib/supabase/server';
import { getTandas as getTandasUseCase } from './application/get-tandas';
import { createTanda as createTandaUseCase } from './application/create-tanda';
import { createTandaSchema } from '@dorado/shared-validation';
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

    const supabase = await createClient();
    const { data: receta } = await supabase
      .from('recetas')
      .select('tipo_receta')
      .eq('id', parsed.data.recetaId)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!receta) {
      return err(new AppError('NOT_FOUND', 404, 'Receta no encontrada'));
    }
    if (receta.tipo_receta !== 'produccion') {
      // Principio Rector: una tanda solo produce recetas de producción. Una
      // tanda de receta de servicio duplicaría el FEFO (tanda + entrega).
      return err(
        new AppError('VALIDATION', 422, 'Solo las recetas de producción se elaboran por tandas'),
      );
    }

    const repo = createProductionRepository();
    const tanda = await createTandaUseCase(repo, ctx.tenantId, {
      recetaId: parsed.data.recetaId,
      cantidadTandas: parsed.data.cantidadTandas,
      zonaDestino: parsed.data.zonaDestino,
      pedidoItemId: parsed.data.pedidoItemId ?? null,
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
        zonaDestino: tanda.zonaDestino,
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

    // Atomic FEFO deduction + state transition via single Postgres RPC.
    // All ingredient deductions and the state change happen in one transaction.
    const adminClient = createAdminClient();
    // Modelo F3: la merma se aplicó en la recepción (stock ya es neto), por lo
    // que se descuenta la cantidad neta de la receta directa, sin inflar.
    const ingredientesPayload = tanda.ingredientes.map((ing) => ({
      insumo_id: ing.insumoId,
      cantidad_bruta: ing.cantidad * tanda.cantidadTandas,
      insumo_nombre: ing.insumoNombre,
    }));

    const { data: rpcResult, error: rpcError } = await adminClient.rpc('fn_completar_tanda', {
      p_tanda_id: tandaId,
      p_tenant_id: ctx.tenantId,
      p_usuario_id: ctx.userId,
      p_ingredientes: ingredientesPayload,
    });

    if (rpcError) {
      if (rpcError.code === 'P0001') {
        return err(new AppError('STOCK_INSUFICIENTE', 409, rpcError.message));
      }
      return err(new AppError('FEFO_ERROR', 500, 'Error al completar tanda. Intenta de nuevo.'));
    }

    const result = rpcResult as { ok: boolean; error?: string } | null;
    if (result && !result.ok) {
      if (result.error === 'TANDA_NOT_FOUND') {
        return err(new AppError('NOT_FOUND', 404, 'Tanda no encontrada'));
      }
      if (result.error === 'INVALID_STATE') {
        return err(new AppError('INVALID_TRANSITION', 400, 'Tanda no está en estado en_proceso'));
      }
      return err(new AppError('FEFO_ERROR', 500, 'Error inesperado al completar tanda'));
    }

    const updated = (await repo.findByIdWithIngredientes(tandaId, ctx.tenantId)) ?? tanda;

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

export interface SolicitudCocina {
  id: string;
  descripcion: string;
  zona: string;
  createdAt: string;
}

export async function getSolicitudesCocina(_limit = 20): Promise<Result<SolicitudCocina[]>> {
  // mensajes_chat eliminado (refoco operacional 2026-05-28); retorna vacío.
  return ok([]);
}
