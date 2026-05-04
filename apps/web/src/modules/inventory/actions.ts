'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createInsumoRepository } from './infrastructure/insumo-repository';
import { getInsumos as getInsumosUseCase } from './application/get-insumos';
import { createInsumo as createInsumoUseCase } from './application/create-insumo';
import { createLote as createLoteUseCase } from './application/create-lote';
import {
  createInsumoSchema,
  createLoteSchema,
  createMermaSchema,
  stockOutSchema,
} from '@dorado/shared-validation';
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

export async function stockOut(input: unknown): Promise<Result<void>> {
  try {
    const ctx = await assertCan('inventory:stock_out');

    const parsed = stockOutSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const admin = createAdminClient();
    const { error: rpcError } = await admin.rpc('fn_descontar_insumo_fefo', {
      p_tenant_id: ctx.tenantId,
      p_insumo_id: parsed.data.insumoId,
      p_cantidad: parsed.data.cantidad,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_tipo: 'ajuste',
      p_referencia_id: null,
      p_referencia_tipo: 'stock_out',
      p_usuario_id: ctx.userId,
    });

    if (rpcError) {
      if (rpcError.code === 'P0001') {
        return err(
          new AppError('STOCK_INSUFICIENTE', 409, 'Stock insuficiente para realizar el descuento'),
        );
      }
      return err(new AppError('FEFO_ERROR', 500, 'Error al descontar stock. Intenta de nuevo.'));
    }

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'inventory:stock_out',
      resourceId: parsed.data.insumoId,
      resourceType: 'insumo',
      payload: { cantidad: parsed.data.cantidad, idempotencyKey: parsed.data.idempotencyKey },
    });

    return ok(undefined);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function registrarMerma(input: unknown): Promise<Result<void>> {
  try {
    const ctx = await assertCan('inventory:merma');

    const parsed = createMermaSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const admin = createAdminClient();

    // Deducir stock vía FEFO antes de registrar la merma
    const { error: rpcError } = await admin.rpc('fn_descontar_insumo_fefo', {
      p_tenant_id: ctx.tenantId,
      p_insumo_id: parsed.data.insumoId,
      p_cantidad: parsed.data.cantidad,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_tipo: 'merma',
      p_referencia_id: null,
      p_referencia_tipo: 'merma',
      p_usuario_id: ctx.userId,
    });

    if (rpcError) {
      if (rpcError.code === 'P0001') {
        return err(
          new AppError('STOCK_INSUFICIENTE', 409, 'Stock insuficiente para registrar la merma'),
        );
      }
      return err(new AppError('FEFO_ERROR', 500, 'Error al descontar stock. Intenta de nuevo.'));
    }

    // Registrar la merma categorizada (idempotent via unique idempotency_key)
    await admin.from('mermas').upsert(
      {
        tenant_id: ctx.tenantId,
        insumo_id: parsed.data.insumoId,
        cantidad: parsed.data.cantidad,
        categoria: parsed.data.categoria,
        descripcion: parsed.data.descripcion ?? null,
        registrado_por: ctx.userId,
        idempotency_key: parsed.data.idempotencyKey,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'inventory:merma',
      resourceId: parsed.data.insumoId,
      resourceType: 'insumo',
      payload: {
        cantidad: parsed.data.cantidad,
        categoria: parsed.data.categoria,
        idempotencyKey: parsed.data.idempotencyKey,
      },
    });

    return ok(undefined);
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
