'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createOrderRepository } from './infrastructure/order-repository';
import { getPedidos as getPedidosUseCase } from './application/get-pedidos';
import { getPedidosByArea as getPedidosByAreaUseCase } from './application/get-pedidos-by-area';
import { createPedido as createPedidoUseCase } from './application/create-pedido';
import { createPedidoSchema } from '@dorado/shared-validation';
import { PEDIDO_TRANSITIONS } from './domain/pedido';
import { CHANNELS } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type { Pedido, PedidoWithItems, PedidoEvento, AreaProduccion } from './domain/pedido';

// ── Carta de servicio (incluye inactivas para toggle) ────────────────────────

export interface CartaReceta {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoriaMenu: string | null;
  imagenUrl: string | null;
  activo: boolean;
  ingredientes: { nombre: string }[];
}

export async function getCartaServicio(): Promise<Result<CartaReceta[]>> {
  try {
    const ctx = await assertCan('recipes:read');
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('recetas')
      .select(
        `id, nombre, descripcion, categoria_menu, imagen_url, activo,
         receta_ingredientes(insumos(nombre))`,
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('tipo_receta', 'servicio')
      .is('deleted_at', null)
      .order('nombre');

    if (error) throw new AppError('DB_ERROR', 500, error.message);

    return ok(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        nombre: r['nombre'] as string,
        descripcion: (r['descripcion'] as string | null) ?? null,
        categoriaMenu: (r['categoria_menu'] as string | null) ?? null,
        imagenUrl: (r['imagen_url'] as string | null) ?? null,
        activo: r['activo'] as boolean,
        ingredientes: ((r['receta_ingredientes'] as Array<Record<string, unknown>>) ?? []).map(
          (ri) => {
            const insumo = ri['insumos'] as Record<string, unknown> | null;
            return { nombre: (insumo?.['nombre'] as string) ?? '' };
          },
        ),
      })),
    );
  } catch (e) {
    return err(toAppError(e));
  }
}

// ── Trazabilidad — fire-and-forget ────────────────────────────────────────────
async function registrarEvento(
  tenantId: string,
  pedidoId: string,
  estado: string,
  actorId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from('pedido_eventos')
      .insert({ tenant_id: tenantId, pedido_id: pedidoId, estado, actor_id: actorId });
  } catch {
    // Best-effort — no bloquea la operación principal
  }
}

export async function getPedidos(): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('orders:read');
    const repo = createOrderRepository();
    return ok(await getPedidosUseCase(repo, ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

// KDS por área (cocina fría / caliente). El permiso se valida por área para que
// cada cocinero solo acceda a su cola; admin/superuser tienen ambas.
const AREA_KDS_PERM: Partial<Record<AreaProduccion, string>> = {
  cocina_fria: 'cocina_fria:read',
  cocina_caliente: 'cocina_caliente:read',
};

export async function getPedidosByArea(area: AreaProduccion): Promise<Result<PedidoWithItems[]>> {
  try {
    const perm = AREA_KDS_PERM[area];
    if (!perm) {
      return err(new AppError('VALIDATION', 400, `Área de KDS no soportada: ${area}`));
    }
    const ctx = await assertCan(perm);
    const repo = createOrderRepository();
    return ok(await getPedidosByAreaUseCase(repo, ctx.tenantId, area));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getPedidosHistorial(): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('orders:read');
    const repo = createOrderRepository();
    return ok(await repo.findRecent(ctx.tenantId, 30));
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

    const supabase = await createClient();
    const { data: turnoData } = await supabase
      .from('turnos')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('activo', true)
      .is('deleted_at', null)
      .maybeSingle();

    const repo = createOrderRepository();
    const pedido = await createPedidoUseCase(repo, ctx.tenantId, ctx.userId, {
      zona: parsed.data.zona,
      idempotencyKey: parsed.data.idempotencyKey,
      numeroMesa: parsed.data.numeroMesa,
      notas: parsed.data.notas,
      turnoId: turnoData?.id ?? undefined,
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

    const pedidoCreadoPayload = {
      type: 'PEDIDO_CREADO' as const,
      payload: {
        pedidoId: pedido.id,
        tenantId: ctx.tenantId,
        zona: pedido.zona,
        ...(pedido.numeroMesa != null && { numeroMesa: pedido.numeroMesa }),
        items: pedido.items.map((i) => ({
          recetaId: i.recetaId,
          cantidad: i.cantidad,
          nombre: i.recetaNombre,
        })),
        creadoPor: ctx.userId,
        createdAt:
          pedido.createdAt instanceof Date ? pedido.createdAt.toISOString() : pedido.createdAt,
      },
    };
    await emitEvent(ctx.tenantId, CHANNELS.COCINA, pedidoCreadoPayload);
    if (pedido.zona === 'amex') {
      await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, pedidoCreadoPayload);
    }

    void registrarEvento(ctx.tenantId, pedido.id, 'creado', ctx.userId);
    return ok(pedido);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function recibirEnCocina(pedidoId: string, version: number): Promise<Result<Pedido>> {
  try {
    // Permiso compartido: cocina marca recepción cuando ve el pedido entrar,
    // mesero/recepción cuando llevan físicamente la orden a la cocina.
    const ctx = await assertCan('orders:receive');
    const repo = createOrderRepository();

    const pedido = await repo.findByIdForDelivery(pedidoId, ctx.tenantId);
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

    const updated = await repo.transition(pedidoId, ctx.tenantId, 'recibido_cocina', version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'orders:recibir_en_cocina',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: { zona: pedido.zona },
    });

    const eventoPayload = {
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
    await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, eventoPayload);
    await emitEvent(ctx.tenantId, CHANNELS.AMEX, eventoPayload);

    void registrarEvento(ctx.tenantId, pedidoId, 'recibido_cocina', ctx.userId);
    return ok(updated);
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

    await emitEvent(ctx.tenantId, CHANNELS.COCINA, {
      type: 'PEDIDO_ESTADO',
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        estadoAnterior: pedido.estado,
        estadoNuevo: 'en_preparacion',
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    });

    void registrarEvento(ctx.tenantId, pedidoId, 'en_preparacion', ctx.userId);
    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function asignarCocinero(
  pedidoId: string,
  cocineroId: string,
  version: number,
): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('orders:dispatch');
    if (!cocineroId) {
      return err(new AppError('VALIDATION', 400, 'Debe indicar el cocinero a asignar'));
    }
    const repo = createOrderRepository();

    // Validar que el cocinero pertenezca a este tenant (defensa multi-tenant:
    // cocinero_id es FK a public.users pero el id llega del cliente).
    const supabase = await createClient();
    const { data: cocinero } = await supabase
      .from('users')
      .select('id')
      .eq('id', cocineroId)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!cocinero) {
      return err(
        new AppError('VALIDATION', 400, 'El cocinero no pertenece a este establecimiento'),
      );
    }

    const pedido = await repo.findByIdForDelivery(pedidoId, ctx.tenantId);
    if (!pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    // Persistencia primero: la asignación queda en DB (optimistic locking) antes
    // del broadcast. Si Socket.io falla, el dato sigue disponible.
    const updated = await repo.asignarCocinero(pedidoId, ctx.tenantId, cocineroId, version);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'orders:asignar_cocinero',
      resourceId: pedidoId,
      resourceType: 'pedido',
      payload: { cocineroId },
    });

    const cocineroPayload = {
      type: 'PEDIDO_COCINERO' as const,
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        cocineroId,
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
    await emitEvent(ctx.tenantId, CHANNELS.COCINA, cocineroPayload);
    await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, cocineroPayload);

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

    const despachoPayload = {
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
    await emitEvent(ctx.tenantId, CHANNELS.COCINA, despachoPayload);
    await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, despachoPayload);
    await emitEvent(ctx.tenantId, CHANNELS.AMEX, despachoPayload);

    void registrarEvento(ctx.tenantId, pedidoId, 'despachado', ctx.userId);
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
        // Modelo F3: la merma se aplicó en la recepción (stock ya es neto),
        // por lo que el consumo descuenta la cantidad neta de la receta directa.
        const cantidadNeta = (ing.cantidadPorBatch / item.recetaPorciones) * item.cantidad;
        const idempotencyKey = `pedido:${pedidoId}:item:${item.id}:ing:${ing.insumoId}`;

        const { error } = await adminClient.rpc('fn_descontar_insumo_fefo', {
          p_tenant_id: ctx.tenantId,
          p_insumo_id: ing.insumoId,
          p_cantidad: cantidadNeta,
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

    await emitEvent(ctx.tenantId, CHANNELS.COCINA, {
      type: 'PEDIDO_ESTADO',
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        estadoAnterior: pedido.estado,
        estadoNuevo: 'entregado',
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    });

    void registrarEvento(ctx.tenantId, pedidoId, 'entregado', ctx.userId);
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

    await emitEvent(ctx.tenantId, CHANNELS.COCINA, {
      type: 'PEDIDO_ESTADO',
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        estadoAnterior: pedido.estado,
        estadoNuevo: 'cancelado',
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    });

    void registrarEvento(ctx.tenantId, pedidoId, 'cancelado', ctx.userId);
    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

// ── Trazabilidad — lectura pública ────────────────────────────────────────────

export async function getEventosPedido(pedidoId: string): Promise<Result<PedidoEvento[]>> {
  try {
    const ctx = await assertCan('orders:read');
    const admin = createAdminClient();

    const { data: rows, error } = await admin
      .from('pedido_eventos')
      .select('id, pedido_id, estado, actor_id, created_at')
      .eq('pedido_id', pedidoId)
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: true });

    if (error) return err(toAppError(new Error(error.message)));

    const actorIds = Array.from(
      new Set((rows ?? []).map((r) => r.actor_id).filter((id): id is string => id != null)),
    );
    let actorMap: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: users } = await admin.from('users').select('id, nombre').in('id', actorIds);
      actorMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.nombre as string]));
    }

    return ok(
      (rows ?? []).map((r) => ({
        id: r.id,
        pedidoId: r.pedido_id,
        estado: r.estado as PedidoEvento['estado'],
        actorId: r.actor_id,
        actorNombre: r.actor_id ? (actorMap[r.actor_id] ?? null) : null,
        createdAt: new Date(r.created_at),
      })),
    );
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function toggleDisponibilidadPlato(
  recetaId: string,
  activo: boolean,
): Promise<Result<{ id: string; activo: boolean }>> {
  try {
    const ctx = await assertCan('recipes:write');
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('recetas')
      .update({ activo })
      .eq('id', recetaId)
      .eq('tenant_id', ctx.tenantId)
      .select('id, activo')
      .single();

    if (error) throw new AppError('DB_ERROR', 500, error.message);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: activo ? 'recetas:habilitar' : 'recetas:inhabilitar',
      resourceId: recetaId,
      resourceType: 'receta',
      payload: { activo },
    });

    return ok({ id: data.id as string, activo: data.activo as boolean });
  } catch (e) {
    return err(toAppError(e));
  }
}
