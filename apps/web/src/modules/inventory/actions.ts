'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkStockMinimo, checkCambioPrecio } from '@/modules/alertas/infrastructure/checks';
import { createInsumoRepository } from './infrastructure/insumo-repository';
import { getInsumos as getInsumosUseCase } from './application/get-insumos';
import { createInsumo as createInsumoUseCase } from './application/create-insumo';
import { updateInsumo as updateInsumoUseCase } from './application/update-insumo';
import { createLote as createLoteUseCase } from './application/create-lote';
import { aplicarMermaRecepcion, costoUnitarioNeto } from './domain/merma';
import {
  mapLoteProximoVencer,
  type LoteProximoVencer,
  type LoteVencimientoRow,
} from './domain/lote-vencimiento';
import {
  createInsumoSchema,
  updateInsumoSchema,
  createLoteSchema,
  createMermaSchema,
  stockOutSchema,
} from '@dorado/shared-validation';
import type { Result } from '@/lib/result';
import type { InsumoWithStock, Insumo, Lote } from './domain/insumo';

// Turno activo del usuario. Todo movimiento de inventario debe quedar vinculado
// a él (CLAUDE.md §Turnos); antes no se propagaba y la analítica por turno
// quedaba vacía (F-004).
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
      p_tipo: 'salida_receta',
      p_referencia_id: null,
      p_referencia_tipo: 'stock_out',
      p_usuario_id: ctx.userId,
      p_turno_id: await turnoActivoId(ctx.tenantId, ctx.userId),
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

    // Descuento FEFO y registro de merma en UNA transacción (fn_registrar_merma).
    // Antes eran dos pasos independientes: si el segundo fallaba, el stock
    // quedaba descontado sin registro de merma y descuadraba la analítica
    // (F-022). La RPC deriva tenant y usuario del JWT, así que se llama con el
    // cliente de sesión, no con service_role.
    const supabase = await createClient();
    const { error: rpcError } = await supabase.rpc('fn_registrar_merma', {
      p_insumo_id: parsed.data.insumoId,
      p_cantidad: parsed.data.cantidad,
      p_categoria: parsed.data.categoria,
      p_descripcion: parsed.data.descripcion ?? null,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_turno_id: await turnoActivoId(ctx.tenantId, ctx.userId),
    });

    if (rpcError) {
      if (rpcError.code === 'P0001') {
        return err(
          new AppError('STOCK_INSUFICIENTE', 409, 'Stock insuficiente para registrar la merma'),
        );
      }
      if (rpcError.code === '42501') {
        return err(new AppError('FORBIDDEN', 403, 'No tienes permiso para registrar mermas'));
      }
      return err(
        new AppError('MERMA_ERROR', 500, 'Error al registrar la merma. Intenta de nuevo.'),
      );
    }

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

    const admin = createAdminClient();

    // Modelo F3: la merma del insumo se aplica UNA VEZ, aquí en la recepción.
    // Se almacena el peso NETO usable y el costo unitario NETO (preservando el
    // valor total del lote). El consumo posterior descuenta neto directo.
    const { data: insumoRow } = await admin
      .from('insumos')
      .select('merma_default')
      .eq('id', parsed.data.insumoId)
      .eq('tenant_id', ctx.tenantId)
      .single();
    const merma = Number(insumoRow?.merma_default ?? 0);

    const cantidadNeta = aplicarMermaRecepcion(parsed.data.cantidadInicial, merma);
    const costoNeto =
      parsed.data.costoUnitario != null
        ? costoUnitarioNeto(parsed.data.costoUnitario, merma)
        : parsed.data.costoUnitario;

    const repo = createInsumoRepository();
    const lote = await createLoteUseCase(repo, ctx.tenantId, {
      insumoId: parsed.data.insumoId,
      cantidadInicial: cantidadNeta,
      fechaVencimiento: parsed.data.fechaVencimiento,
      proveedor: parsed.data.proveedor,
      proveedorId: parsed.data.proveedorId,
      costoUnitario: costoNeto,
      cantidadEmpaques: parsed.data.cantidadEmpaques,
      pesoUnitario: parsed.data.pesoUnitario,
      unidadPeso: parsed.data.unidadPeso,
    });

    // Registra movimiento de entrada con la cantidad NETA (coherente con stock).
    // movimientos_inventario no tiene INSERT RLS → admin client.
    await admin.from('movimientos_inventario').insert({
      tenant_id: ctx.tenantId,
      insumo_id: parsed.data.insumoId,
      lote_id: lote.id,
      tipo: 'entrada',
      cantidad: cantidadNeta,
      usuario_id: ctx.userId,
      turno_id: await turnoActivoId(ctx.tenantId, ctx.userId),
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

export type { LoteProximoVencer };

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

    const rows = (data ?? []).map((row) =>
      mapLoteProximoVencer(row as unknown as LoteVencimientoRow, hoy),
    );

    return ok(rows);
  } catch (e) {
    return err(toAppError(e));
  }
}
