'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOrderRepository } from './infrastructure/order-repository';
import { getPedidos as getPedidosUseCase } from './application/get-pedidos';
import { createPedido as createPedidoUseCase } from './application/create-pedido';
import { createPedidoSchema } from '@dorado/shared-validation';
import { cantidadConMerma } from '@/modules/inventory/domain/merma';
import { PEDIDO_TRANSITIONS } from './domain/pedido';
import type { Result } from '@/lib/result';
import type { Pedido, PedidoWithItems } from './domain/pedido';

export async function getPedidos(): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('orders:read');
    const repo = createOrderRepository();
    return ok(await getPedidosUseCase(repo, ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createPedido(input: unknown): Promise<Result<PedidoWithItems>> {
  try {
    const ctx = await assertCan('orders:create');

    const parsed = createPedidoSchema.safeParse(input);
    if (!parsed.success) {
      return err(toAppError(new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos')));
    }

    const repo = createOrderRepository();
    const pedido = await createPedidoUseCase(repo, ctx.tenantId, ctx.userId, {
      zona: parsed.data.zona,
      idempotencyKey: parsed.data.idempotencyKey,
      numeroMesa: parsed.data.numeroMesa,
      notas: parsed.data.notas,
      items: parsed.data.items.map((item) => ({
        recetaId: item.recetaId,
        cantidad: item.cantidad,
        notas: item.notas,
      })),
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'orders:create_pedido',
      resourceId: pedido.id,
      resourceType: 'pedido',
      payload: { zona: pedido.zona, itemsCount: pedido.items.length },
    });

    return ok(pedido);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function iniciarPreparacion(
  pedidoId: string,
  version: number,
): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('orders:dispatch');
    const repo = createOrderRepository();

    const pedido = await repo.findByIdForDelivery(pedidoId, ctx.tenantId);
    if (!pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    if (!PEDIDO_TRANSITIONS[pedido.estado].includes('en_preparacion')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede iniciar un pedido en estado '${pedido.estado}'`,
        ),
      );
    }

    const updated = await repo.transition(pedidoId, ctx.tenantId, 'en_preparacion', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'orders:iniciar_preparacion',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: {},
    });

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function despacharPedido(pedidoId: string, version: number): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('orders:dispatch');
    const repo = createOrderRepository();

    const pedido = await repo.findByIdForDelivery(pedidoId, ctx.tenantId);
    if (!pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    if (!PEDIDO_TRANSITIONS[pedido.estado].includes('despachado')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede despachar un pedido en estado '${pedido.estado}'`,
        ),
      );
    }

    const updated = await repo.transition(pedidoId, ctx.tenantId, 'despachado', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'orders:despachar_pedido',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: {},
    });

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function entregarPedido(pedidoId: string, version: number): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('orders:deliver');
    const repo = createOrderRepository();

    const pedido = await repo.findByIdForDelivery(pedidoId, ctx.tenantId);
    if (!pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    if (!PEDIDO_TRANSITIONS[pedido.estado].includes('entregado')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede entregar un pedido en estado '${pedido.estado}'`,
        ),
      );
    }

    // Descontar stock via FEFO. La cantidad por ítem es:
    // cantidadNeta = (cantidadPorBatch / recetaPorciones) * cantidad_pedida
    const adminClient = createAdminClient();
    for (const item of pedido.items) {
      for (const ing of item.ingredientes) {
        const cantidadNeta = (ing.cantidadPorBatch / item.recetaPorciones) * item.cantidad;
        const cantidadBruta = cantidadConMerma(cantidadNeta, ing.mermaCoeficiente);
        const idempotencyKey = `pedido:${pedidoId}:item:${item.id}:ing:${ing.insumoId}`;

        const { error } = await adminClient.rpc('fn_descontar_insumo_fefo', {
          p_tenant_id: ctx.tenantId,
          p_insumo_id: ing.insumoId,
          p_cantidad: cantidadBruta,
          p_idempotency_key: idempotencyKey,
          p_tipo: 'salida_receta',
          p_referencia_id: pedidoId,
          p_referencia_tipo: 'pedido',
          p_usuario_id: ctx.userId,
        });

        if (error) {
          throw new AppError(
            error.code === 'P0001' ? 'STOCK_INSUFICIENTE' : 'FEFO_ERROR',
            error.code === 'P0001' ? 409 : 500,
            error.code === 'P0001'
              ? `Stock insuficiente para: ${ing.insumoNombre}`
              : `Error al descontar stock de '${ing.insumoNombre}'. Intenta de nuevo.`,
          );
        }
      }
    }

    const updated = await repo.transition(pedidoId, ctx.tenantId, 'entregado', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'orders:entregar_pedido',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: { itemsCount: pedido.items.length },
    });

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function cancelarPedido(pedidoId: string, version: number): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('orders:cancel');
    const repo = createOrderRepository();

    const pedido = await repo.findByIdForDelivery(pedidoId, ctx.tenantId);
    if (!pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    if (!PEDIDO_TRANSITIONS[pedido.estado].includes('cancelado')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede cancelar un pedido en estado '${pedido.estado}'`,
        ),
      );
    }

    const updated = await repo.transition(pedidoId, ctx.tenantId, 'cancelado', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'orders:cancelar_pedido',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: {},
    });

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}
