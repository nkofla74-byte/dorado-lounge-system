'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createTurnoRepository } from './infrastructure/turno-repository';
import { getTurnos as getTurnosUseCase } from './application/get-turnos';
import { createTurno as createTurnoUseCase } from './application/create-turno';
import { cerrarTurno as cerrarTurnoUseCase } from './application/cerrar-turno';
import { createTurnoSchema } from '@dorado/shared-validation';
import { TurnoYaActivoError, TurnoNoActivoError } from './domain/turno';
import type { Result } from '@/lib/result';
import type { Turno } from './domain/turno';

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

export async function iniciarTurno(input: unknown): Promise<Result<Turno>> {
  try {
    const ctx = await assertCan('turnos:write');

    const parsed = createTurnoSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createTurnoRepository();
    const turno = await createTurnoUseCase(repo, ctx.tenantId, parsed.data.nombre, ctx.userId);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'turnos:iniciar',
      resourceId: turno.id,
      resourceType: 'turno',
      payload: { nombre: turno.nombre },
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
    const turno = await cerrarTurnoUseCase(repo, turnoId, ctx.tenantId);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'turnos:cerrar',
      resourceId: turno.id,
      resourceType: 'turno',
      payload: { nombre: turno.nombre, cerradoAt: turno.cerradoAt },
    });

    return ok(turno);
  } catch (e) {
    if (e instanceof TurnoNoActivoError) {
      return err(new AppError('TURNO_NO_ACTIVO', 409, e.message));
    }
    return err(toAppError(e));
  }
}
