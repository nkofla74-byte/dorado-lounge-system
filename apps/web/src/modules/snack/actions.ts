'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createSnackRepository } from './infrastructure/snack-repository';
import { getDespachos as getDespachoUseCase } from './application/get-despachos';
import { getStuartRequests as getStuartUseCase } from './application/get-stuart-requests';
import { enviarStuartSchema, solicitarPreparacionSchema } from '@dorado/shared-validation';
import { CHANNELS } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type { DespachoSnack, TurnoActivo } from './domain/despacho-snack';
import type { StuartRequest } from './domain/stuart-request';
import type { SolicitudPreparacion } from './domain/solicitud-preparacion';

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

export async function getSolicitudesPreparacion(
  limit?: number,
): Promise<Result<SolicitudPreparacion[]>> {
  try {
    const ctx = await assertCan('snack:read');
    const repo = createSnackRepository();
    return ok(await repo.findSolicitudesPreparacion(ctx.tenantId, limit));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function solicitarPreparacion(input: unknown): Promise<Result<SolicitudPreparacion>> {
  try {
    const ctx = await assertCan('snack:write');

    const parsed = solicitarPreparacionSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const destino = parsed.data.destino;
    const DESTINO_CANAL = {
      cocina_fria: 'sala:cocina:fria',
      cocina_caliente: 'sala:cocina:caliente',
      pasteleria: 'sala:broadcast:cocina',
    } as const;
    const DESTINO_SOCKET = {
      cocina_fria: CHANNELS.COCINA_FRIA,
      cocina_caliente: CHANNELS.COCINA_CALIENTE,
      pasteleria: CHANNELS.BROADCAST_COCINA,
    } as const;
    const canal = DESTINO_CANAL[destino];
    const socketChannel = DESTINO_SOCKET[destino];

    const repo = createSnackRepository();
    const solicitud = await repo.createSolicitudPreparacion(ctx.tenantId, {
      remitenteId: ctx.userId,
      descripcion: parsed.data.descripcion,
      canal,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'snack:solicitud_preparacion',
      resourceId: solicitud.id,
      resourceType: 'mensaje_chat',
      payload: { descripcion: solicitud.descripcion, destino },
    });

    await emitEvent(ctx.tenantId, socketChannel, {
      type: 'SOLICITUD_PREPARACION',
      payload: {
        solicitudId: solicitud.id,
        tenantId: ctx.tenantId,
        zona: 'snack',
        solicitanteId: ctx.userId,
        descripcion: solicitud.descripcion,
        createdAt:
          solicitud.createdAt instanceof Date
            ? solicitud.createdAt.toISOString()
            : String(solicitud.createdAt),
      },
    });

    return ok(solicitud);
  } catch (e) {
    return err(toAppError(e));
  }
}
