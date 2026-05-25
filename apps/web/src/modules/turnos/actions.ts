'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTurnoRepository } from './infrastructure/turno-repository';
import { getTurnos as getTurnosUseCase } from './application/get-turnos';
import { createTurno as createTurnoUseCase } from './application/create-turno';
import { cerrarTurno as cerrarTurnoUseCase } from './application/cerrar-turno';
import { createTurnoSchema } from '@dorado/shared-validation';
import { TurnoYaActivoError, TurnoNoActivoError } from './domain/turno';
import { CHANNELS } from '@dorado/shared-types';
import { detectarBloqueActual } from '@/lib/turnos';
import type { Result } from '@/lib/result';
import type { Turno } from './domain/turno';

export interface UsuarioResumen {
  id: string;
  nombre: string;
}

export async function getUsuariosResumen(): Promise<Result<UsuarioResumen[]>> {
  try {
    const ctx = await assertCan('turnos:read');
    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('id, nombre')
      .eq('tenant_id', ctx.tenantId)
      .in('role', ['admin', 'chef', 'sous_chef', 'steward'])
      .order('nombre');
    return ok((data ?? []).map((u) => ({ id: u.id as string, nombre: u.nombre as string })));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTurnos(): Promise<Result<Turno[]>> {
  try {
    const ctx = await assertCan('turnos:read');
    const repo = createTurnoRepository();
    return ok(await getTurnosUseCase(repo, ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTurnoActivo(): Promise<Result<Turno | null>> {
  try {
    const ctx = await assertCan('turnos:read');
    const repo = createTurnoRepository();
    return ok(await repo.findActivo(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

/**
 * Devuelve el turno activo del usuario logueado, o null si no tiene.
 * Usado por el modal TurnoGuard y la pill del topbar.
 */
export async function getMiTurnoActivo(): Promise<Result<Turno | null>> {
  try {
    const ctx = await assertCan('turnos:read');
    const repo = createTurnoRepository();
    return ok(await repo.findActivoByUser(ctx.tenantId, ctx.userId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function iniciarTurno(input: unknown): Promise<Result<Turno>> {
  try {
    const ctx = await assertCan('turnos:write');

    const raw = (input ?? {}) as Record<string, unknown>;
    const candidate = { bloque: raw.bloque ?? detectarBloqueActual(), teamlider: raw.teamlider };
    const parsed = createTurnoSchema.safeParse(candidate);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createTurnoRepository();
    const turno = await createTurnoUseCase(
      repo,
      ctx.tenantId,
      parsed.data.bloque,
      parsed.data.teamlider,
      ctx.userId,
    );

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'turnos:iniciar',
      resourceId: turno.id,
      resourceType: 'turno',
      payload: { bloque: turno.bloque, teamlider: turno.teamlider },
    });

    await emitEvent(ctx.tenantId, CHANNELS.ADMIN, {
      type: 'TURNO_EVENTO',
      payload: {
        turnoId: turno.id,
        tenantId: ctx.tenantId,
        nombre: turno.bloque ?? turno.nombre,
        accion: 'iniciado',
        responsableId: ctx.userId,
        timestamp:
          turno.iniciadoAt instanceof Date
            ? turno.iniciadoAt.toISOString()
            : turno.createdAt.toISOString(),
      },
    });

    return ok(turno);
  } catch (e) {
    if (e instanceof TurnoYaActivoError) {
      return err(new AppError('TURNO_YA_ACTIVO', 409, e.message));
    }
    return err(toAppError(e));
  }
}

export async function cerrarTurno(turnoId: string): Promise<Result<Turno>> {
  try {
    const ctx = await assertCan('turnos:write');
    const repo = createTurnoRepository();
    const turno = await cerrarTurnoUseCase(repo, turnoId, ctx.tenantId, ctx.userId);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'turnos:cerrar',
      resourceId: turno.id,
      resourceType: 'turno',
      payload: { nombre: turno.nombre, cerradoAt: turno.cerradoAt },
    });

    await emitEvent(ctx.tenantId, CHANNELS.ADMIN, {
      type: 'TURNO_EVENTO',
      payload: {
        turnoId: turno.id,
        tenantId: ctx.tenantId,
        nombre: turno.bloque ?? turno.nombre,
        accion: 'cerrado',
        responsableId: ctx.userId,
        timestamp:
          turno.cerradoAt instanceof Date
            ? turno.cerradoAt.toISOString()
            : new Date().toISOString(),
      },
    });

    return ok(turno);
  } catch (e) {
    if (e instanceof TurnoNoActivoError) {
      return err(new AppError('TURNO_NO_ACTIVO', 409, e.message));
    }
    return err(toAppError(e));
  }
}
