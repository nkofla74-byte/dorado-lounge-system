'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkStockMinimo, checkCambioPrecio } from '@/modules/alertas/infrastructure/checks';
import { createInsumoRepository } from './infrastructure/insumo-repository';
import { getInsumos as getInsumosUseCase } from './application/get-insumos';
import { createInsumo as createInsumoUseCase } from './application/create-insumo';
import { updateInsumo as updateInsumoUseCase } from './application/update-insumo';
import { createLote as createLoteUseCase } from './application/create-lote';
import {
  createInsumoSchema,
  updateInsumoSchema,
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

export async function updateInsumo(input: unknown): Promise<Result<Insumo>> {
  try {
    const ctx = await assertCan('inventory:write');

    const parsed = updateInsumoSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createInsumoRepository();
    const insumo = await updateInsumoUseCase(repo, ctx.tenantId, parsed.data);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'inventory:update_insumo',
      resourceId: insumo.id,
      resourceType: 'insumo',
      payload: {
        nombre: insumo.nombre,
        stockMinimo: insumo.stockMinimo,
        mermaDefault: insumo.mermaDefault,
      },
    });

    return ok(insumo);
  } catch (e) {
    return err(toAppError(e));
  }
}

export interface BulkImportRowError {
  row: number;
  message: string;
}

export interface BulkImportResult {
  created: number;
  failed: BulkImportRowError[];
}

export async function createInsumosBulk(rows: unknown): Promise<Result<BulkImportResult>> {
  try {
    const ctx = await assertCan('inventory:write');

    if (!Array.isArray(rows)) {
      return err(toAppError(new Error('Se esperaba un arreglo de insumos')));
    }
    if (rows.length === 0) {
      return err(toAppError(new Error('Sin filas para importar')));
    }
    if (rows.length > 500) {
      return err(toAppError(new Error('Máximo 500 filas por carga')));
    }

    const repo = createInsumoRepository();
    const failed: BulkImportRowError[] = [];
    let created = 0;
    const createdIds: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = createInsumoSchema.safeParse(rows[i]);
      if (!parsed.success) {
        failed.push({
          row: i + 1,
          message: parsed.error.errors[0]?.message ?? 'Datos inválidos',
        });
        continue;
      }
      try {
        const insumo = await createInsumoUseCase(repo, ctx.tenantId, {
          ...parsed.data,
          codigo: parsed.data.codigo || null,
        });
        created++;
        createdIds.push(insumo.id);
      } catch (e) {
        failed.push({
          row: i + 1,
          message: e instanceof Error ? e.message : 'Error desconocido',
        });
      }
    }

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'inventory:bulk_import_insumos',
      resourceType: 'insumo',
      payload: {
        attempted: rows.length,
        created,
        failed: failed.length,
        createdIds,
      },
    });

    return ok({ created, failed });
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

    // Fire-and-forget: verificar stock mínimo tras descuento
    void checkStockMinimo(ctx.tenantId, parsed.data.insumoId);

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
      proveedorId: parsed.data.proveedorId,
      costoUnitario: parsed.data.costoUnitario,
      cantidadEmpaques: parsed.data.cantidadEmpaques,
      pesoUnitario: parsed.data.pesoUnitario,
      unidadPeso: parsed.data.unidadPeso,
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

    // Fire-and-forget: detectar cambio de precio vs lote anterior
    if (lote.costoUnitario != null) {
      void checkCambioPrecio(ctx.tenantId, lote.insumoId, lote.costoUnitario, lote.id);
    }

    return ok(lote);
  } catch (e) {
    return err(toAppError(e));
  }
}

export interface LoteProximoVencer {
  loteId: string;
  insumoNombre: string;
  fechaVencimiento: string;
  diasRestantes: number;
  cantidadActual: number;
}

export async function getLotesProximosVencer(dias = 7): Promise<Result<LoteProximoVencer[]>> {
  try {
    await assertCan('inventory:read');
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    const limite = new Date();
    limite.setDate(limite.getDate() + dias);

    const { data, error } = await supabase
      .from('lotes')
      .select('id, cantidad_actual, fecha_vencimiento, insumos(nombre)')
      .is('deleted_at', null)
      .eq('activo', true)
      .gt('cantidad_actual', 0)
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', limite.toISOString().split('T')[0])
      .order('fecha_vencimiento', { ascending: true });

    if (error) return err(toAppError(new Error(error.message)));

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    type LoteVencRow = {
      id: string;
      cantidad_actual: number;
      fecha_vencimiento: string;
      insumos: { nombre: string }[] | null;
    };
    const rows = (data ?? []).map((row) => {
      const r = row as unknown as LoteVencRow;
      const fv = new Date(r.fecha_vencimiento);
      const diff = Math.round((fv.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      return {
        loteId: r.id,
        insumoNombre: r.insumos?.[0]?.nombre ?? '—',
        fechaVencimiento: r.fecha_vencimiento,
        diasRestantes: diff,
        cantidadActual: Number(r.cantidad_actual),
      };
    });

    return ok(rows);
  } catch (e) {
    return err(toAppError(e));
  }
}
