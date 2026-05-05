'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createSnackRepository } from './infrastructure/snack-repository';
import { getDespachos as getDespachoUseCase } from './application/get-despachos';
import { getStuartRequests as getStuartUseCase } from './application/get-stuart-requests';
import { enviarStuartSchema } from '@dorado/shared-validation';
import { CHANNELS } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type { DespachoSnack, TurnoActivo } from './domain/despacho-snack';
import type { StuartRequest } from './domain/stuart-request';

export async function getDespachos(turnoId?: string): Promise<Result<DespachoSnack[]>> {
  try {
    const ctx = await assertCan('snack:read');
    const repo = createSnackRepository();
    return ok(await getDespachoUseCase(repo, ctx.tenantId, turnoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTurnosActivos(): Promise<Result<TurnoActivo[]>> {
  try {
    const ctx = await assertCan('snack:read');
    const repo = createSnackRepository();
    return ok(await repo.findTurnosActivos(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getStuartRequests(limit?: number): Promise<Result<StuartRequest[]>> {
  try {
    const ctx = await assertCan('snack:read');
    const repo = createSnackRepository();
    return ok(await getStuartUseCase(repo, ctx.tenantId, limit));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function enviarStuart(input: unknown): Promise<Result<StuartRequest>> {
  try {
    const ctx = await assertCan('snack:write');

    const parsed = enviarStuartSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createSnackRepository();
    const request = await repo.createStuartRequest(ctx.tenantId, {
      remitenteId: ctx.userId,
      descripcion: parsed.data.descripcion,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'snack:stuart_request',
      resourceId: request.id,
      resourceType: 'mensaje_chat',
      payload: { descripcion: request.descripcion, canal: request.canal },
    });

    await emitEvent(ctx.tenantId, CHANNELS.STUART_SNACK, {
      type: 'STUART_REQUEST',
      payload: {
        tenantId: ctx.tenantId,
        zona: 'snack',
        solicitanteId: ctx.userId,
        descripcion: request.descripcion,
        createdAt:
          request.createdAt instanceof Date ? request.createdAt.toISOString() : request.createdAt,
      },
    });

    return ok(request);
  } catch (e) {
    return err(toAppError(e));
  }
}
