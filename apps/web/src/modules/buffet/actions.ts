'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createAdminClient } from '@/lib/supabase/admin';
import { cantidadConMerma } from '@/modules/inventory/utilities';
import { createBuffetRepository } from './infrastructure/buffet-repository';
import { getDespachos as getDespachoUseCase } from './application/get-despachos';
import { getTicketsByTurno as getTicketsUseCase } from './application/get-tickets';
import {
  despacharLoteBuffetSchema,
  registrarTicketsTurnoSchema,
  solicitarPreparacionSchema,
} from '@dorado/shared-validation';
import { CHANNELS } from '@dorado/shared-types';
import { createClient } from '@/lib/supabase/server';
import type { Result } from '@/lib/result';
import type { DespachoBuffet } from './domain/despacho-buffet';
import type { TicketTurno, TurnoActivo } from './domain/ticket-turno';

export async function getDespachos(turnoId?: string): Promise<Result<DespachoBuffet[]>> {
  try {
    const ctx = await assertCan('buffet:read');
    const repo = createBuffetRepository();
    return ok(await getDespachoUseCase(repo, ctx.tenantId, turnoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTicketsByTurno(turnoId: string): Promise<Result<TicketTurno[]>> {
  try {
    const ctx = await assertCan('buffet:read');
    const repo = createBuffetRepository();
    return ok(await getTicketsUseCase(repo, ctx.tenantId, turnoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTurnosActivos(): Promise<Result<TurnoActivo[]>> {
  try {
    const ctx = await assertCan('buffet:read');
    const repo = createBuffetRepository();
    return ok(await repo.findTurnosActivos(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getRecetasServicioBuffet(): Promise<
  Result<{ id: string; nombre: string; porciones: number }[]>
> {
  try {
    const ctx = await assertCan('buffet:read');
    const repo = createBuffetRepository();
    return ok(await repo.findRecetasServicioBuffet(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function despacharLoteBuffet(input: unknown): Promise<Result<DespachoBuffet>> {
  try {
    const ctx = await assertCan('buffet:write');

    const parsed = despacharLoteBuffetSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createBuffetRepository();

    const receta = await repo.findRecetaServicioBuffet(parsed.data.recetaId, ctx.tenantId);
    if (!receta) {
      return err(new AppError('NOT_FOUND', 404, 'Receta de servicio buffet no encontrada'));
    }

    const despacho = await repo.createDespacho(ctx.tenantId, {
      recetaId: parsed.data.recetaId,
      cantidad: parsed.data.cantidad,
      turnoId: parsed.data.turnoId ?? null,
      idempotencyKey: parsed.data.idempotencyKey,
      responsableId: ctx.userId,
    });

    // Descontar ingredientes via fn_descontar_insumo_fefo (atómico, FEFO, SECURITY DEFINER).
    // cantidad_neta = cantidad_por_batch * cantidad_tandas; merma se aplica antes de llamar.
    if (receta.ingredientes.length > 0) {
      const adminClient = createAdminClient();

      for (const ing of receta.ingredientes) {
        const cantidadNeta = ing.cantidadPorBatch * parsed.data.cantidad;
        const cantidadBruta = cantidadConMerma(cantidadNeta, ing.mermaCoeficiente);
        const idempotencyKey = `despacho:buffet:${despacho.id}:ing:${ing.insumoId}`;

        const { data, error } = await adminClient.rpc('fn_descontar_insumo_fefo', {
          p_tenant_id: ctx.tenantId,
          p_insumo_id: ing.insumoId,
          p_cantidad: cantidadBruta,
          p_idempotency_key: idempotencyKey,
          p_tipo: 'salida_receta',
          p_referencia_id: despacho.id,
          p_referencia_tipo: 'despacho',
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

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'buffet:despacho',
      resourceId: despacho.id,
      resourceType: 'despacho',
      payload: {
        recetaId: despacho.recetaId,
        recetaNombre: receta.nombre,
        cantidad: despacho.cantidad,
        turnoId: despacho.turnoId,
        ingredientesDescontados: receta.ingredientes.length,
      },
    });

    await emitEvent(ctx.tenantId, CHANNELS.BUFFET, {
      type: 'DESPACHO',
      payload: {
        despachoId: despacho.id,
        tenantId: ctx.tenantId,
        recetaId: despacho.recetaId,
        zona: 'buffet',
        cantidad: despacho.cantidad,
        idempotencyKey: parsed.data.idempotencyKey,
        despachoPor: ctx.userId,
        createdAt:
          despacho.createdAt instanceof Date
            ? despacho.createdAt.toISOString()
            : despacho.createdAt,
      },
    });

    return ok(despacho);
  } catch (e) {
    return err(toAppError(e));
  }
}

export interface SolicitudPreparacionBuffet {
  id: string;
  descripcion: string;
  createdAt: string;
}

export async function getSolicitudesPreparacion(
  limit = 20,
): Promise<Result<SolicitudPreparacionBuffet[]>> {
  try {
    const ctx = await assertCan('buffet:read');
    const supabase = await createClient();

    const { data, error: dbError } = await supabase
      .from('mensajes_chat')
      .select('id, contenido, created_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('canal', 'sala:cocina')
      .eq('tipo', 'alert')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (dbError) throw new AppError('DB_ERROR', 500, dbError.message);

    return ok(
      (data ?? []).map((r) => ({
        id: r.id as string,
        descripcion: r.contenido as string,
        createdAt: r.created_at as string,
      })),
    );
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function solicitarPreparacion(
  input: unknown,
): Promise<Result<SolicitudPreparacionBuffet>> {
  try {
    const ctx = await assertCan('buffet:write');

    const parsed = solicitarPreparacionSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const destino = parsed.data.destino;
    const canal = destino === 'pasteleria' ? 'sala:broadcast:cocina' : 'sala:cocina';
    const socketChannel = destino === 'pasteleria' ? CHANNELS.BROADCAST_COCINA : CHANNELS.COCINA;

    const supabase = await createClient();
    const { data, error: dbError } = await supabase
      .from('mensajes_chat')
      .insert({
        tenant_id: ctx.tenantId,
        canal,
        remitente_id: ctx.userId,
        contenido: parsed.data.descripcion,
        tipo: 'alert',
      })
      .select('id, contenido, created_at')
      .single();

    if (dbError) throw new AppError('DB_ERROR', 500, dbError.message);

    const solicitud = {
      id: data.id as string,
      descripcion: data.contenido as string,
      createdAt: data.created_at as string,
    };

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'buffet:solicitud_preparacion',
      resourceId: solicitud.id,
      resourceType: 'mensaje_chat',
      payload: { descripcion: solicitud.descripcion, destino },
    });

    await emitEvent(ctx.tenantId, socketChannel, {
      type: 'SOLICITUD_PREPARACION',
      payload: {
        solicitudId: solicitud.id,
        tenantId: ctx.tenantId,
        zona: 'buffet',
        solicitanteId: ctx.userId,
        descripcion: solicitud.descripcion,
        createdAt: solicitud.createdAt,
      },
    });

    return ok(solicitud);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function registrarTicketsCierre(input: unknown): Promise<Result<TicketTurno>> {
  try {
    const ctx = await assertCan('buffet:write');

    const parsed = registrarTicketsTurnoSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createBuffetRepository();
    const ticket = await repo.createTickets(ctx.tenantId, {
      turnoId: parsed.data.turnoId,
      cantidadTickets: parsed.data.cantidadTickets,
      idempotencyKey: parsed.data.idempotencyKey,
      registradoPor: ctx.userId,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'buffet:tickets_cierre',
      resourceId: ticket.id,
      resourceType: 'buffet_ticket',
      payload: {
        turnoId: ticket.turnoId,
        cantidadTickets: ticket.cantidadTickets,
      },
    });

    return ok(ticket);
  } catch (e) {
    return err(toAppError(e));
  }
}
