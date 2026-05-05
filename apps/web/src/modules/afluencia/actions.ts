'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAfluenciaRepository } from './infrastructure/afluencia-repository';
import { getAfluenciaByTurno as getAfluenciaUseCase } from './application/get-afluencia';
import { getTotalPasajeros as getTotalUseCase } from './application/get-afluencia';
import { registrarIngreso as registrarIngresoUseCase } from './application/registrar-ingreso';
import { registrarIngresoSchema } from '@dorado/shared-validation';
import { IngresoInvalidoError } from './domain/afluencia';
import { AppError } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { AfluenciaIngreso } from './domain/afluencia';

export async function getAfluenciaByTurno(turnoId: string): Promise<Result<AfluenciaIngreso[]>> {
  try {
    const ctx = await assertCan('afluencia:read');
    const repo = createAfluenciaRepository();
    return ok(await getAfluenciaUseCase(repo, ctx.tenantId, turnoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTotalPasajeros(turnoId: string): Promise<Result<number>> {
  try {
    const ctx = await assertCan('afluencia:read');
    const repo = createAfluenciaRepository();
    return ok(await getTotalUseCase(repo, ctx.tenantId, turnoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function registrarIngreso(input: unknown): Promise<Result<AfluenciaIngreso>> {
  try {
    const ctx = await assertCan('afluencia:write');

    const parsed = registrarIngresoSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createAfluenciaRepository();
    const ingreso = await registrarIngresoUseCase(repo, ctx.tenantId, ctx.userId, {
      turnoId: parsed.data.turnoId,
      cantidad: parsed.data.cantidad,
      zona: parsed.data.zona ?? null,
      vueloNumero: parsed.data.vueloNumero ?? null,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'afluencia:registrar_ingreso',
      resourceId: ingreso.id,
      resourceType: 'afluencia_ingreso',
      payload: {
        turnoId: ingreso.turnoId,
        cantidad: ingreso.cantidad,
        zona: ingreso.zona,
        vueloNumero: ingreso.vueloNumero,
      },
    });

    return ok(ingreso);
  } catch (e) {
    if (e instanceof IngresoInvalidoError) {
      return err(new AppError('INGRESO_INVALIDO', 400, e.message));
    }
    return err(toAppError(e));
  }
}
