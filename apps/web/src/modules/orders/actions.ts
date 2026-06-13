'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { zonaPermitidaParaRol } from '@/lib/auth/permissions';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createOrderRepository } from './infrastructure/order-repository';
import { getPedidos as getPedidosUseCase } from './application/get-pedidos';
import { getPedidosByArea as getPedidosByAreaUseCase } from './application/get-pedidos-by-area';
import { createPedido as createPedidoUseCase } from './application/create-pedido';
import { createPedidoSchema, zonaServicioSchema } from '@dorado/shared-validation';
import { calcularDescuentosPedido } from './application/calcular-descuentos';
import { PEDIDO_TRANSITIONS } from './domain/pedido';
import {
  CHANNELS,
  ITEM_TRANSITIONS,
  ZONA_CHANNEL,
  ZONA_AREAS_PERMITIDAS,
} from '@dorado/shared-types';
import type { UserRole } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type {
  Pedido,
  PedidoWithItems,
  PedidoEvento,
  AreaProduccion,
  EstadoItem,
  ZonaServicio,
} from './domain/pedido';
import type {
  TrazaFiltros,
  TrazaPedidoSummary,
  TrazaPedidoDetalle,
} from './application/get-trazabilidad';

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

// ── Catálogo de elaboraciones (snack/buffet) ─────────────────────────────────
// Las zonas de origen piden ELABORACIONES (recetas tipo produccion con
// cantidades estandarizadas por tanda), no platos de carta.

export interface CartaElaboracion {
  id: string;
  nombre: string;
  area: AreaProduccion;
  porciones: number;
}

export async function getCartaElaboraciones(
  zona: ZonaServicio,
): Promise<Result<CartaElaboracion[]>> {
  try {
    const ctx = await assertCan('recipes:read');
    const areasPermitidas = ZONA_AREAS_PERMITIDAS[zona];
    if (!areasPermitidas) {
      return err(new AppError('VALIDATION', 400, `Zona desconocida: ${zona}`));
    }
    const zonaError = guardZona(ctx.role, zona);
    if (zonaError) return err(zonaError);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('recetas')
      .select('id, nombre, area_produccion, porciones')
      .eq('tenant_id', ctx.tenantId)
      .eq('tipo_receta', 'produccion')
      .eq('activo', true)
      .in('area_produccion', areasPermitidas)
      .is('deleted_at', null)
      .order('nombre');

    if (error) throw new AppError('DB_ERROR', 500, error.message);

    return ok(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        nombre: r['nombre'] as string,
        area: r['area_produccion'] as AreaProduccion,
        porciones: (r['porciones'] as number) ?? 1,
      })),
    );
  } catch (e) {
    return err(toAppError(e));
  }
}

// ── Trazabilidad — fire-and-forget ────────────────────────────────────────────
// Roles de zona (personal_snack/personal_buffet) solo operan su propia zona.
function guardZona(role: UserRole, zona: string): AppError | null {
  if (!zonaPermitidaParaRol(role, zona)) {
    return new AppError('FORBIDDEN', 403, `El rol '${role}' no puede operar la zona '${zona}'`);
  }
  return null;
}

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
  pasteleria: 'pasteleria:read',
};

const AREA_WRITE_PERM: Partial<Record<AreaProduccion, string>> = {
  cocina_fria: 'cocina_fria:write',
  cocina_caliente: 'cocina_caliente:write',
  amex: 'cocina_amex:write',
  pasteleria: 'pasteleria:write',
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

    const zonaError = guardZona(ctx.role, parsed.data.zona);
    if (zonaError) return err(zonaError);

    // 1 turno activo por (tenant, usuario) — el pedido se vincula al turno del creador
    const supabase = await createClient();
    const { data: turnoData } = await supabase
      .from('turnos')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('responsable_id', ctx.userId)
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
    if (pedido.items.some((i) => i.areaProduccion === 'pasteleria')) {
      await emitEvent(ctx.tenantId, CHANNELS.COCINA_PASTELERIA, pedidoCreadoPayload);
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
    if (pedido.zona === 'amex') {
      await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, eventoPayload);
    }
    await emitEvent(ctx.tenantId, ZONA_CHANNEL[pedido.zona], eventoPayload);

    void registrarEvento(ctx.tenantId, pedidoId, 'recibido_cocina', ctx.userId);
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

export async function entregarPedido(pedidoId: string, version: number): Promise<Result<Pedido>> {
  try {
    const ctx = await assertCan('orders:deliver');
    const repo = createOrderRepository();

    const pedido = await repo.findByIdForDelivery(pedidoId, ctx.tenantId);
    if (!pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    const zonaError = guardZona(ctx.role, pedido.zona);
    if (zonaError) return err(zonaError);

    if (!PEDIDO_TRANSITIONS[pedido.estado].includes('entregado')) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede entregar un pedido en estado '${pedido.estado}'`,
        ),
      );
    }

    const adminClient = createAdminClient();
    const descuentos = calcularDescuentosPedido(pedidoId, pedido.items);
    for (const d of descuentos) {
      const { error } = await adminClient.rpc('fn_descontar_insumo_fefo', {
        p_tenant_id: ctx.tenantId,
        p_insumo_id: d.insumoId,
        p_cantidad: d.cantidad,
        p_idempotency_key: d.idempotencyKey,
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
            ? `Stock insuficiente para: ${d.insumoNombre}`
            : `Error al descontar stock de '${d.insumoNombre}'. Intenta de nuevo.`,
        );
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
    await emitEvent(ctx.tenantId, ZONA_CHANNEL[pedido.zona], {
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

    const zonaError = guardZona(ctx.role, pedido.zona);
    if (zonaError) return err(zonaError);

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

    const canceladoPayload = {
      type: 'PEDIDO_ESTADO' as const,
      payload: {
        pedidoId,
        tenantId: ctx.tenantId,
        estadoAnterior: pedido.estado,
        estadoNuevo: 'cancelado' as const,
        zona: pedido.zona,
        updatedAt:
          updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      },
    };
    await emitEvent(ctx.tenantId, CHANNELS.COCINA, canceladoPayload);
    await emitEvent(ctx.tenantId, ZONA_CHANNEL[pedido.zona], canceladoPayload);

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

// ── Transiciones de ítem KDS ──────────────────────────────────────────────────

async function ejecutarTransicionItem(
  itemId: string,
  version: number,
  nuevoEstado: EstadoItem,
  accionAudit: string,
): Promise<Result<{ pedidoEstado: string }>> {
  try {
    // Resolver tenant del actor con un permiso base de cocina; el permiso fino
    // por área se exige abajo según el área real del ítem.
    const ctxBase = await assertCan('orders:read');
    const repo = createOrderRepository();

    const item = await repo.findItemForTransition(itemId, ctxBase.tenantId);
    if (!item) return err(new AppError('NOT_FOUND', 404, 'Ítem no encontrado'));
    if (item.area === null) {
      return err(new AppError('VALIDATION', 400, 'El ítem no tiene área productiva asignada'));
    }

    const perm = AREA_WRITE_PERM[item.area];
    if (!perm) return err(new AppError('VALIDATION', 400, `Área sin despacho KDS: ${item.area}`));
    const ctx = await assertCan(perm);

    if (!ITEM_TRANSITIONS[item.estado].includes(nuevoEstado)) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede pasar el ítem de '${item.estado}' a '${nuevoEstado}'`,
        ),
      );
    }
    if (nuevoEstado === 'en_preparacion' && item.estado === 'listo') {
      if (['entregado', 'cancelado'].includes(item.pedidoEstado)) {
        return err(
          new AppError('INVALID_TRANSITION', 400, 'No se puede hacer recall de un pedido cerrado'),
        );
      }
    }

    const result = await repo.transitionItem({
      itemId,
      pedidoId: item.pedidoId,
      tenantId: ctx.tenantId,
      nuevoEstado,
      actorId: ctx.userId,
      pedidoVersion: version,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: accionAudit,
      resourceId: itemId,
      resourceType: 'pedido_item',
      payload: { area: item.area, nuevoEstado, pedidoId: item.pedidoId },
    });

    const updatedAt = new Date().toISOString();
    const itemEvento = {
      type: 'ITEM_ESTADO' as const,
      payload: {
        pedidoId: item.pedidoId,
        itemId,
        tenantId: ctx.tenantId,
        area: item.area,
        estadoAnterior: item.estado as 'pendiente' | 'en_preparacion' | 'listo',
        estadoNuevo: nuevoEstado as 'pendiente' | 'en_preparacion' | 'listo',
        updatedAt,
      },
    };
    await emitEvent(ctx.tenantId, CHANNELS.COCINA, itemEvento);
    if (item.area === 'amex') {
      await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, itemEvento);
    }
    if (item.area === 'pasteleria') {
      await emitEvent(ctx.tenantId, CHANNELS.COCINA_PASTELERIA, itemEvento);
    }
    if (result.pedidoEstado === 'despachado') {
      await emitEvent(ctx.tenantId, ZONA_CHANNEL[item.zona], {
        type: 'PEDIDO_ESTADO',
        payload: {
          pedidoId: item.pedidoId,
          tenantId: ctx.tenantId,
          estadoAnterior: item.pedidoEstado,
          estadoNuevo: result.pedidoEstado,
          zona: item.zona,
          updatedAt,
        },
      });
    }

    void registrarEvento(ctx.tenantId, item.pedidoId, result.pedidoEstado, ctx.userId);
    return ok({ pedidoEstado: result.pedidoEstado });
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function iniciarItem(itemId: string, version: number) {
  return ejecutarTransicionItem(itemId, version, 'en_preparacion', 'orders:iniciar_item');
}
export async function marcarItemListo(itemId: string, version: number) {
  return ejecutarTransicionItem(itemId, version, 'listo', 'orders:marcar_item_listo');
}
export async function recallItem(itemId: string, version: number) {
  return ejecutarTransicionItem(itemId, version, 'en_preparacion', 'orders:recall_item');
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

// ── Trazabilidad admin ────────────────────────────────────────────────────────

export async function getTrazabilidadPedidos(
  filtros: TrazaFiltros,
): Promise<Result<TrazaPedidoSummary[]>> {
  try {
    const ctx = await assertCan('orders:trace');
    const admin = createAdminClient();

    let query = admin
      .from('pedidos')
      .select('id, zona, numero_mesa, estado, cocinero_id, created_at, pedido_items(id)')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(filtros.limit ?? 50);

    if (filtros.desde) query = query.gte('created_at', filtros.desde);
    if (filtros.hasta) query = query.lte('created_at', filtros.hasta);
    if (filtros.zona) query = query.eq('zona', filtros.zona);
    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.mesa) query = query.eq('numero_mesa', filtros.mesa);

    const { data, error } = await query;
    if (error) return err(toAppError(new Error(error.message)));

    const rows = (data ?? []) as Array<{
      id: string;
      zona: string;
      numero_mesa: string | null;
      estado: string;
      cocinero_id: string | null;
      created_at: string;
      pedido_items: { id: string }[];
    }>;

    const cocineroIds = Array.from(
      new Set(rows.map((r) => r.cocinero_id).filter((id): id is string => id != null)),
    );
    let cocineroMap: Record<string, string> = {};
    if (cocineroIds.length > 0) {
      const { data: users } = await admin.from('users').select('id, nombre').in('id', cocineroIds);
      cocineroMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.nombre as string]));
    }

    return ok(
      rows.map((r) => ({
        pedidoId: r.id,
        zona: r.zona,
        numeroMesa: r.numero_mesa ?? null,
        estado: r.estado,
        responsableNombre: r.cocinero_id ? (cocineroMap[r.cocinero_id] ?? null) : null,
        cantidadItems: r.pedido_items.length,
        createdAt: r.created_at,
      })),
    );
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getTrazaPedido(pedidoId: string): Promise<Result<TrazaPedidoDetalle>> {
  try {
    const ctx = await assertCan('orders:trace');
    const admin = createAdminClient();

    const { data: pedido, error: pError } = await admin
      .from('pedidos')
      .select(
        'id, zona, numero_mesa, estado, cocinero_id, created_at, pedido_items(id, area_produccion, cantidad, receta:recetas(nombre))',
      )
      .eq('id', pedidoId)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (pError || !pedido) return err(new AppError('NOT_FOUND', 404, 'Pedido no encontrado'));

    type PedidoRowTraza = {
      id: string;
      zona: string;
      numero_mesa: string | null;
      estado: string;
      cocinero_id: string | null;
      created_at: string;
      pedido_items: Array<{
        id: string;
        area_produccion: string | null;
        cantidad: number;
        receta: { nombre: string } | { nombre: string }[] | null;
      }>;
    };
    const pedidoRow = pedido as unknown as PedidoRowTraza;

    const { data: pedidoEvs } = await admin
      .from('pedido_eventos')
      .select('estado, actor_id, created_at')
      .eq('pedido_id', pedidoId)
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: true });

    const { data: itemEvs } = await admin
      .from('pedido_item_eventos')
      .select('item_id, estado, actor_id, created_at')
      .eq('pedido_id', pedidoId)
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: true });

    const allActorIds = Array.from(
      new Set(
        [
          ...(pedidoEvs ?? []).map((e: { actor_id: string | null }) => e.actor_id),
          ...(itemEvs ?? []).map((e: { actor_id: string | null }) => e.actor_id),
          pedidoRow.cocinero_id,
        ].filter((id): id is string => id != null),
      ),
    );
    let actorMap: Record<string, string> = {};
    if (allActorIds.length > 0) {
      const { data: users } = await admin.from('users').select('id, nombre').in('id', allActorIds);
      actorMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.nombre as string]));
    }

    const getRecetaNombre = (receta: { nombre: string } | { nombre: string }[] | null): string => {
      if (!receta) return '';
      if (Array.isArray(receta)) return receta[0]?.nombre ?? '';
      return receta.nombre;
    };

    const itemNameMap = Object.fromEntries(
      pedidoRow.pedido_items.map((i) => [i.id, getRecetaNombre(i.receta)]),
    );

    type PedidoEvRow = { estado: string; actor_id: string | null; created_at: string };
    type ItemEvRow = {
      item_id: string;
      estado: string;
      actor_id: string | null;
      created_at: string;
    };

    const pedidoEntries = (pedidoEvs ?? []).map((e: PedidoEvRow) => ({
      tipo: 'pedido' as const,
      estado: e.estado,
      actorNombre: e.actor_id ? (actorMap[e.actor_id] ?? null) : null,
      at: e.created_at,
    }));

    const itemEntries = (itemEvs ?? []).map((e: ItemEvRow) => {
      const entry: TrazaPedidoDetalle['timeline'][number] = {
        tipo: 'item' as const,
        estado: e.estado,
        actorNombre: e.actor_id ? (actorMap[e.actor_id] ?? null) : null,
        at: e.created_at,
      };
      const nombre = itemNameMap[e.item_id];
      if (nombre) entry.itemNombre = nombre;
      return entry;
    });

    const timeline: TrazaPedidoDetalle['timeline'] = [...pedidoEntries, ...itemEntries].sort(
      (a, b) => a.at.localeCompare(b.at),
    );

    return ok({
      pedidoId: pedidoRow.id,
      zona: pedidoRow.zona,
      numeroMesa: pedidoRow.numero_mesa ?? null,
      estado: pedidoRow.estado,
      creadoPor: pedidoRow.cocinero_id ? (actorMap[pedidoRow.cocinero_id] ?? null) : null,
      cocineroId: pedidoRow.cocinero_id ?? null,
      createdAt: pedidoRow.created_at,
      timeline,
    });
  } catch (e) {
    return err(toAppError(e));
  }
}

// ── Vista de zona (snack/buffet) ──────────────────────────────────────────────

export async function getPedidosZona(zona: ZonaServicio): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('orders:read');

    const parsed = zonaServicioSchema.safeParse(zona);
    if (!parsed.success) {
      return err(new AppError('VALIDATION', 400, `Zona desconocida: ${String(zona)}`));
    }
    const zonaError = guardZona(ctx.role, parsed.data);
    if (zonaError) return err(zonaError);

    const repo = createOrderRepository();
    return ok(await repo.findActiveByZona(ctx.tenantId, parsed.data));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getPedidosTurnoZona(zona: ZonaServicio): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('orders:read');

    const parsed = zonaServicioSchema.safeParse(zona);
    if (!parsed.success) {
      return err(new AppError('VALIDATION', 400, `Zona desconocida: ${String(zona)}`));
    }
    const zonaError = guardZona(ctx.role, parsed.data);
    if (zonaError) return err(zonaError);

    // 1 turno activo por (tenant, usuario) — "Mi turno" es el turno del usuario actual
    const supabase = await createClient();
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('responsable_id', ctx.userId)
      .eq('activo', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (!turno) return ok([]);

    const repo = createOrderRepository();
    return ok(await repo.findByTurnoZona(ctx.tenantId, turno.id, parsed.data));
  } catch (e) {
    return err(toAppError(e));
  }
}

export type { TrazaFiltros, TrazaPedidoSummary, TrazaPedidoDetalle };
