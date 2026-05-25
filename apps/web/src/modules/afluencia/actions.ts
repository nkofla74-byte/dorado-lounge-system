'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAfluenciaRepository } from './infrastructure/afluencia-repository';
import { getAfluenciaByTurno as getAfluenciaUseCase } from './application/get-afluencia';
import { getTotalPasajeros as getTotalUseCase } from './application/get-afluencia';
import { registrarIngreso as registrarIngresoUseCase } from './application/registrar-ingreso';
import { registrarIngresoSchema } from '@dorado/shared-validation';
import { registrarPasajero as registrarPasajeroUseCase } from './application/registrar-pasajero';
import { IngresoInvalidoError } from './domain/afluencia';
import { PasajeroInvalidoError } from './domain/pasajero-ingreso';
import { AppError } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { AfluenciaIngreso } from './domain/afluencia';
import type { PasajeroIngreso, RegistrarPasajeroInput } from './domain/pasajero-ingreso';

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

// ── Registro individual de pasajeros ────────────────────────────────────────

export async function getPasajerosByTurno(turnoId: string): Promise<Result<PasajeroIngreso[]>> {
  try {
    const ctx = await assertCan('afluencia:read');
    const repo = createAfluenciaRepository();
    return ok(await repo.findPasajerosByTurno(ctx.tenantId, turnoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTotalPasajerosIndividual(turnoId: string): Promise<Result<number>> {
  try {
    const ctx = await assertCan('afluencia:read');
    const repo = createAfluenciaRepository();
    return ok(await repo.getTotalPasajerosByTurno(ctx.tenantId, turnoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function registrarPasajero(
  input: RegistrarPasajeroInput,
): Promise<Result<PasajeroIngreso>> {
  try {
    const ctx = await assertCan('afluencia:write');
    const repo = createAfluenciaRepository();

    const pasajero = await registrarPasajeroUseCase(repo, ctx.tenantId, ctx.userId, input);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'afluencia:registrar_pasajero',
      resourceId: pasajero.id,
      resourceType: 'pasajero_ingreso',
      payload: {
        turnoId: pasajero.turnoId,
        tipoAcceso: pasajero.tipoAcceso,
        zona: pasajero.zona,
        vueloNumero: pasajero.vueloNumero,
        acompanantes: pasajero.acompanantes,
      },
    });

    return ok(pasajero);
  } catch (e) {
    if (e instanceof PasajeroInvalidoError) {
      return err(new AppError('PASAJERO_INVALIDO', 400, e.message));
    }
    return err(toAppError(e));
  }
}
