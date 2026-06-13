'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { areaPermitidaParaRol } from '@/lib/auth/permissions';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createClient } from '@/lib/supabase/server';
import { createRequisicionRepository } from './infrastructure/requisicion-repository';
import { createRequisicion as createUseCase } from './application/create-requisicion';
import { transitionRequisicion as transitionUseCase } from './application/transition-requisicion';
import { createRequisicionSchema, despacharRequisicionSchema } from '@dorado/shared-validation';
import { CHANNELS } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type {
  Requisicion,
  RequisicionWithItems,
  AreaSolicitante,
  EstadoRequisicion,
} from './domain/requisicion';
import type { UserRole } from '@dorado/shared-types';

// Roles de cocina solo operan requisiciones de su propia área (los turnos rotan,
// se valida el área, no la identidad del solicitante).
function guardArea(role: UserRole, area: string): AppError | null {
  if (!areaPermitidaParaRol(role, area)) {
    return new AppError('FORBIDDEN', 403, `El rol '${role}' no puede operar el área '${area}'`);
  }
  return null;
}

// 1 turno activo por (tenant, usuario): la requisición se vincula al turno del creador.
async function turnoActivoId(tenantId: string, userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('turnos')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('responsable_id', userId)
    .eq('activo', true)
    .is('deleted_at', null)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function emitEstado(
  req: { id: string; areaSolicitante: AreaSolicitante },
  tenantId: string,
  estadoAnterior: EstadoRequisicion,
  estadoNuevo: EstadoRequisicion,
): Promise<void> {
  return emitEvent(tenantId, CHANNELS.ALMACEN, {
    type: 'REQUISICION_ESTADO',
    payload: {
      requisicionId: req.id,
      tenantId,
      areaSolicitante: req.areaSolicitante,
      estadoAnterior,
      estadoNuevo,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function createRequisicion(input: unknown): Promise<Result<RequisicionWithItems>> {
  try {
    const ctx = await assertCan('requisiciones:create');
    const parsed = createRequisicionSchema.safeParse(input);
    if (!parsed.success) {
      return err(
        new AppError('VALIDATION', 400, parsed.error.errors[0]?.message ?? 'Datos inválidos'),
      );
    }
    const areaErr = guardArea(ctx.role, parsed.data.areaSolicitante);
    if (areaErr) return err(areaErr);

    const turnoId = (await turnoActivoId(ctx.tenantId, ctx.userId)) ?? undefined;
    const repo = createRequisicionRepository();
    const req = await createUseCase(repo, ctx.tenantId, ctx.userId, { ...parsed.data, turnoId });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'requisiciones:crear',
      resourceId: req.id,
      resourceType: 'requisicion',
      payload: { areaSolicitante: req.areaSolicitante, items: req.items.length },
    });
    await emitEstado(req, ctx.tenantId, 'solicitada', 'solicitada');
    return ok(req);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getColaAlmacen(): Promise<Result<RequisicionWithItems[]>> {
  try {
    const ctx = await assertCan('requisiciones:read');
    const repo = createRequisicionRepository();
    return ok(await repo.findColaAlmacen(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getRequisicionesArea(
  area: AreaSolicitante,
): Promise<Result<RequisicionWithItems[]>> {
  try {
    const ctx = await assertCan('requisiciones:read');
    const areaErr = guardArea(ctx.role, area);
    if (areaErr) return err(areaErr);
    const repo = createRequisicionRepository();
    return ok(await repo.findByArea(ctx.tenantId, area));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function alistarRequisicion(
  id: string,
  version: number,
): Promise<Result<Requisicion>> {
  return transicionar('requisiciones:despachar', id, version, 'en_alistamiento', false);
}

export async function despacharRequisicion(input: unknown): Promise<Result<Requisicion>> {
  try {
    const ctx = await assertCan('requisiciones:despachar');
    const parsed = despacharRequisicionSchema.safeParse(input);
    if (!parsed.success) {
      return err(
        new AppError('VALIDATION', 400, parsed.error.errors[0]?.message ?? 'Datos inválidos'),
      );
    }
    const repo = createRequisicionRepository();
    const req = await repo.findById(parsed.data.requisicionId, ctx.tenantId);
    if (!req) return err(new AppError('NOT_FOUND', 404, 'Requisición no encontrada'));

    const updated = await repo.despachar(
      req.id,
      ctx.tenantId,
      ctx.userId,
      parsed.data.items,
      parsed.data.version,
    );
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'requisiciones:despachar',
      resourceId: req.id,
      resourceType: 'requisicion',
      payload: { items: parsed.data.items.length },
    });
    await emitEstado(req, ctx.tenantId, req.estado, 'despachada');
    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function confirmarRecibido(id: string, version: number): Promise<Result<Requisicion>> {
  return transicionar('requisiciones:confirmar', id, version, 'recibida', true);
}

export async function cancelarRequisicion(
  id: string,
  version: number,
): Promise<Result<Requisicion>> {
  return transicionar('requisiciones:cancel', id, version, 'cancelada', true);
}

// Helper común de las transiciones simples (alistar / recibir / cancelar).
// `guardByArea`: valida que el área de la requisición corresponda al rol.
async function transicionar(
  permiso: string,
  id: string,
  version: number,
  estadoNuevo: EstadoRequisicion,
  guardByArea: boolean,
): Promise<Result<Requisicion>> {
  try {
    const ctx = await assertCan(permiso);
    const repo = createRequisicionRepository();
    const req = await repo.findById(id, ctx.tenantId);
    if (!req) return err(new AppError('NOT_FOUND', 404, 'Requisición no encontrada'));
    if (guardByArea) {
      const areaErr = guardArea(ctx.role, req.areaSolicitante);
      if (areaErr) return err(areaErr);
    }
    const updated = await transitionUseCase(
      repo,
      id,
      ctx.tenantId,
      ctx.userId,
      estadoNuevo,
      version,
    );
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: `requisiciones:${estadoNuevo}`,
      resourceId: id,
      resourceType: 'requisicion',
      payload: {},
    });
    await emitEstado(req, ctx.tenantId, req.estado, estadoNuevo);
    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}
