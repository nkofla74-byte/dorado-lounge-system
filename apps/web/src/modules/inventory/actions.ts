'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createInsumoRepository } from './infrastructure/insumo-repository';
import { getInsumos as getInsumosUseCase } from './application/get-insumos';
import { createInsumo as createInsumoUseCase } from './application/create-insumo';
import { createLote as createLoteUseCase } from './application/create-lote';
import { createInsumoSchema, createLoteSchema } from '@dorado/shared-validation';
import type { Result } from '@/lib/result';
import type { InsumoWithStock, Insumo, Lote } from './domain/insumo';

export async function getInsumos(): Promise<Result<InsumoWithStock[]>> {
  try {
    await assertCan('inventory:read');
    const repo = createInsumoRepository();
    return ok(await getInsumosUseCase(repo));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createInsumo(input: unknown): Promise<Result<Insumo>> {
  try {
    const ctx = await assertCan('inventory:write');

    const parsed = createInsumoSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createInsumoRepository();
    const insumo = await createInsumoUseCase(repo, ctx.tenantId, {
      ...parsed.data,
      codigo: parsed.data.codigo || null,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'inventory:create_insumo',
      resourceId: insumo.id,
      resourceType: 'insumo',
      payload: { nombre: insumo.nombre, capa: insumo.capa },
    });

    return ok(insumo);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getLotesByInsumo(insumoId: string): Promise<Result<Lote[]>> {
  try {
    await assertCan('inventory:read');
    const repo = createInsumoRepository();
    return ok(await repo.findLotesByInsumo(insumoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createLote(input: unknown): Promise<Result<Lote>> {
  try {
    const ctx = await assertCan('inventory:write');

    const parsed = createLoteSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createInsumoRepository();
    const lote = await createLoteUseCase(repo, ctx.tenantId, {
      insumoId: parsed.data.insumoId,
      cantidadInicial: parsed.data.cantidadInicial,
      fechaVencimiento: parsed.data.fechaVencimiento,
      proveedor: parsed.data.proveedor,
      costoUnitario: parsed.data.costoUnitario,
    });

    // Registra movimiento de entrada (movimientos_inventario no tiene INSERT RLS)
    const admin = createAdminClient();
    await admin.from('movimientos_inventario').insert({
      tenant_id: ctx.tenantId,
      insumo_id: parsed.data.insumoId,
      lote_id: lote.id,
      tipo: 'entrada',
      cantidad: parsed.data.cantidadInicial,
      usuario_id: ctx.userId,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'inventory:create_lote',
      resourceId: lote.id,
      resourceType: 'lote',
      payload: {
        insumoId: lote.insumoId,
        cantidadInicial: lote.cantidadInicial,
        fechaVencimiento: lote.fechaVencimiento,
      },
    });

    return ok(lote);
  } catch (e) {
    return err(toAppError(e));
  }
}
