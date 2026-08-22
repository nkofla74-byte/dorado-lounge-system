'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createCocinaAmexRepository } from './infrastructure/cocina-amex-repository';
import { getPedidosAmex as getPedidosAmexUseCase } from './application/get-pedidos-amex';
import { getEventosPedido as getEventosPedidoUseCase } from './application/get-eventos-pedido';
import { CHANNELS } from '@dorado/shared-types';
import { PEDIDO_TRANSITIONS } from './domain/pedido-amex';
import type { Result } from '@/lib/result';
import type { Pedido, PedidoWithItems, PedidoEvento } from './domain/pedido-amex';

export async function getPedidosAmexKds(): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('cocina_amex:read');
    const repo = createCocinaAmexRepository();
    return ok(await getPedidosAmexUseCase(repo, ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getEventosPedidoAmex(pedidoId: string): Promise<Result<PedidoEvento[]>> {
  try {
    const ctx = await assertCan('cocina_amex:read');
    const repo = createCocinaAmexRepository();
    return ok(await getEventosPedidoUseCase(repo, ctx.tenantId, pedidoId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function recibirPedidoAmex(
  pedidoId: string,
  version: number,
): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('cocina_amex:write');
    const repo = createCocinaAmexRepository();

    const pedido = await repo.findById(ctx.tenantId, pedidoId);
    if (!pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    if (!PEDIDO_TRANSITIONS[pedido.estado].includes('recibido_cocina')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede recibir un pedido en estado '${pedido.estado}'`,
        ),
      );
    }

    const updated = await repo.transition(ctx.tenantId, pedidoId, 'recibido_cocina', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'cocina_amex:recibir_pedido',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: { estadoAnterior: pedido.estado },
    });

    const payload = {
      type: 'PEDIDO_ESTADO' as const,
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        estadoAnterior: pedido.estado,
        estadoNuevo: 'recibido_cocina' as const,
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
    await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, payload);
    await emitEvent(ctx.tenantId, CHANNELS.AMEX, payload);

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function iniciarPreparacionAmex(
  pedidoId: string,
  version: number,
): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('cocina_amex:write');
    const repo = createCocinaAmexRepository();

    const pedido = await repo.findById(ctx.tenantId, pedidoId);
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

    const updated = await repo.transition(ctx.tenantId, pedidoId, 'en_preparacion', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'cocina_amex:iniciar_preparacion',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: { estadoAnterior: pedido.estado },
    });

    const payload = {
      type: 'PEDIDO_ESTADO' as const,
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        estadoAnterior: pedido.estado,
        estadoNuevo: 'en_preparacion' as const,
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
    await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, payload);
    await emitEvent(ctx.tenantId, CHANNELS.AMEX, payload);

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function despacharPedidoAmex(
  pedidoId: string,
  version: number,
): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('cocina_amex:write');
    const repo = createCocinaAmexRepository();

    const pedido = await repo.findById(ctx.tenantId, pedidoId);
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

    const updated = await repo.transition(ctx.tenantId, pedidoId, 'despachado', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'cocina_amex:despachar_pedido',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: { estadoAnterior: pedido.estado },
    });

    const payload = {
      type: 'PEDIDO_ESTADO' as const,
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        estadoAnterior: pedido.estado,
        estadoNuevo: 'despachado' as const,
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
    await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, payload);
    await emitEvent(ctx.tenantId, CHANNELS.AMEX, payload);

    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}
