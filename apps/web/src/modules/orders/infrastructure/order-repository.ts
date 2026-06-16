import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { OrderRepository } from '../application/ports/order-repository.port';
import type { TipoReceta } from '@dorado/shared-types';
import type {
  Pedido,
  PedidoItem,
  PedidoWithItems,
  PedidoForDelivery,
  PedidoItemConIngredientes,
  CreatePedidoInput,
  EstadoPedido,
  EstadoItem,
  ZonaServicio,
  AreaProduccion,
} from '../domain/pedido';
import { estadoPedidoDesdeItems } from '../domain/item-estado';

type ItemRow = {
  id: string;
  pedido_id: string;
  receta_id: string;
  cantidad: number;
  notas: string | null;
  area_produccion: string | null;
  estado: string | null;
  en_preparacion_at: string | null;
  listo_at: string | null;
  iniciado_por: string | null;
  listo_por: string | null;
  receta: { nombre: string } | null;
};

type EventoRow = {
  estado: string;
  created_at: string;
};

type PedidoRow = {
  id: string;
  tenant_id: string;
  numero_mesa: string | null;
  zona: string;
  estado: string;
  version: number;
  notas: string | null;
  cocinero_id: string | null;
  created_at: string;
  updated_at: string;
  pedido_items: ItemRow[];
  pedido_eventos: EventoRow[];
};

type ItemWithIngsRow = {
  id: string;
  pedido_id: string;
  receta_id: string;
  cantidad: number;
  notas: string | null;
  area_produccion: string | null;
  estado: string | null;
  en_preparacion_at: string | null;
  listo_at: string | null;
  iniciado_por: string | null;
  listo_por: string | null;
  receta: {
    nombre: string;
    porciones: number;
    tipo_receta: string;
    receta_ingredientes: Array<{
      insumo_id: string;
      cantidad: number;
      merma_coeficiente: number;
      insumo: { nombre: string } | null;
    }>;
  } | null;
};

type PedidoWithIngsRow = Omit<PedidoRow, 'pedido_items'> & {
  pedido_items: ItemWithIngsRow[];
};

const PEDIDO_SELECT = `
  id, tenant_id, numero_mesa, zona, estado, version, notas, cocinero_id, created_at, updated_at,
  pedido_items(id, pedido_id, receta_id, cantidad, notas, area_produccion, estado, en_preparacion_at, listo_at, iniciado_por, listo_por, receta:recetas(nombre)),
  pedido_eventos(estado, created_at)
`;

const PEDIDO_FLAT_SELECT =
  'id, tenant_id, numero_mesa, zona, estado, version, notas, cocinero_id, created_at, updated_at';

function toPedido(row: Omit<PedidoRow, 'pedido_items'>): Pedido {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    numeroMesa: row.numero_mesa,
    zona: row.zona as ZonaServicio,
    estado: row.estado as EstadoPedido,
    version: row.version,
    notas: row.notas,
    cocineroId: row.cocinero_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toItem(i: ItemRow): PedidoItem {
  return {
    id: i.id,
    pedidoId: i.pedido_id,
    recetaId: i.receta_id,
    recetaNombre: i.receta?.nombre ?? '',
    cantidad: i.cantidad,
    notas: i.notas,
    areaProduccion: (i.area_produccion ?? null) as AreaProduccion | null,
    estado: (i.estado ?? 'pendiente') as EstadoItem,
    enPreparacionAt: i.en_preparacion_at ? new Date(i.en_preparacion_at) : null,
    listoAt: i.listo_at ? new Date(i.listo_at) : null,
    iniciadoPor: i.iniciado_por ?? null,
    listoPor: i.listo_por ?? null,
  };
}

// Deriva timestamps por transición. Toma el ÚLTIMO evento de cada estado
// (improbable que haya múltiples por el state machine, pero por seguridad).
function buildTimestamps(
  eventos: EventoRow[] | undefined,
): import('../domain/pedido').PedidoTimestamps {
  const lastBy: Record<string, string> = {};
  for (const e of eventos ?? []) {
    if (!lastBy[e.estado] || e.created_at > lastBy[e.estado]!) {
      lastBy[e.estado] = e.created_at;
    }
  }
  const at = (k: string): Date | null => (lastBy[k] ? new Date(lastBy[k]!) : null);
  return {
    recibidoCocinaAt: at('recibido_cocina'),
    enPreparacionAt: at('en_preparacion'),
    despachadoAt: at('despachado'),
    entregadoAt: at('entregado'),
    canceladoAt: at('cancelado'),
  };
}

function toPedidoWithItems(row: PedidoRow): PedidoWithItems {
  return {
    ...toPedido(row),
    items: (row.pedido_items ?? []).map(toItem),
    timestamps: buildTimestamps(row.pedido_eventos),
  };
}

function toPedidoForDelivery(row: PedidoWithIngsRow): PedidoForDelivery {
  const items: PedidoItemConIngredientes[] = (row.pedido_items ?? []).map((i) => ({
    id: i.id,
    pedidoId: i.pedido_id,
    recetaId: i.receta_id,
    recetaNombre: i.receta?.nombre ?? '',
    cantidad: i.cantidad,
    notas: i.notas,
    areaProduccion: (i.area_produccion ?? null) as AreaProduccion | null,
    estado: (i.estado ?? 'pendiente') as EstadoItem,
    enPreparacionAt: i.en_preparacion_at ? new Date(i.en_preparacion_at) : null,
    listoAt: i.listo_at ? new Date(i.listo_at) : null,
    iniciadoPor: i.iniciado_por ?? null,
    listoPor: i.listo_por ?? null,
    recetaPorciones: i.receta?.porciones ?? 1,
    recetaTipo: (i.receta?.tipo_receta ?? 'servicio') as TipoReceta,
    ingredientes: (i.receta?.receta_ingredientes ?? []).map((ri) => ({
      insumoId: ri.insumo_id,
      insumoNombre: ri.insumo?.nombre ?? '',
      cantidadPorBatch: Number(ri.cantidad),
      mermaCoeficiente: Number(ri.merma_coeficiente),
    })),
  }));
  return { ...toPedido(row), items };
}

export function createOrderRepository(): OrderRepository {
  return {
    async findActive(tenantId: string): Promise<PedidoWithItems[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_SELECT)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('estado', ['creado', 'recibido_cocina', 'en_preparacion', 'despachado'])
        .order('created_at', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as PedidoRow[]).map(toPedidoWithItems);
    },

    async findActiveByZona(tenantId: string, zona: string): Promise<PedidoWithItems[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_SELECT)
        .eq('tenant_id', tenantId)
        .eq('zona', zona)
        .is('deleted_at', null)
        .in('estado', ['creado', 'recibido_cocina', 'en_preparacion', 'despachado'])
        .order('created_at', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as PedidoRow[]).map(toPedidoWithItems);
    },

    async findByTurnoZona(
      tenantId: string,
      turnoId: string,
      zona: string,
    ): Promise<PedidoWithItems[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_SELECT)
        .eq('tenant_id', tenantId)
        .eq('turno_id', turnoId)
        .eq('zona', zona)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as PedidoRow[]).map(toPedidoWithItems);
    },

    async findActiveByArea(tenantId: string, area: AreaProduccion): Promise<PedidoWithItems[]> {
      const supabase = await createClient();
      // `pedido_items!inner` + filtro por área: devuelve solo pedidos con al menos
      // un ítem ruteado a esta área, y embebe únicamente esos ítems (vista enfocada
      // por KDS). El estado del pedido es compartido (modelo a nivel de pedido).
      const { data, error } = await supabase
        .from('pedidos')
        .select(
          `
          id, tenant_id, numero_mesa, zona, estado, version, notas, cocinero_id, created_at, updated_at,
          pedido_items!inner(id, pedido_id, receta_id, cantidad, notas, area_produccion, estado, en_preparacion_at, listo_at, iniciado_por, listo_por, receta:recetas(nombre)),
          pedido_eventos(estado, created_at)
        `,
        )
        .eq('tenant_id', tenantId)
        .eq('pedido_items.area_produccion', area)
        .is('deleted_at', null)
        .in('estado', ['creado', 'recibido_cocina', 'en_preparacion', 'despachado'])
        .order('created_at', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as PedidoRow[]).map(toPedidoWithItems);
    },

    async findRecent(tenantId: string, limit: number): Promise<PedidoWithItems[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_SELECT)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .in('estado', ['entregado', 'cancelado'])
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as PedidoRow[]).map(toPedidoWithItems);
    },

    async findRecetaAreas(
      tenantId: string,
      recetaIds: string[],
    ): Promise<Record<string, AreaProduccion | null>> {
      if (recetaIds.length === 0) return {};
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('recetas')
        .select('id, area_produccion')
        .eq('tenant_id', tenantId)
        .in('id', recetaIds);

      if (error) throw new AppError('DB_ERROR', 500, error.message);

      const out: Record<string, AreaProduccion | null> = {};
      for (const row of (data ?? []) as Array<{ id: string; area_produccion: string | null }>) {
        out[row.id] = (row.area_produccion ?? null) as AreaProduccion | null;
      }
      return out;
    },

    async create(
      tenantId: string,
      userId: string,
      input: CreatePedidoInput,
      itemAreas: Record<string, AreaProduccion>,
    ): Promise<PedidoWithItems> {
      const supabase = await createClient();

      // Creación atómica (pedido + ítems en una transacción) vía RPC, para no
      // dejar pedidos huérfanos si falla el insert de ítems. Ver migración
      // 20260530000004_fn_crear_pedido.sql.
      const { data: nuevoPedidoId, error: rpcError } = await supabase.rpc('fn_crear_pedido', {
        p_tenant_id: tenantId,
        p_responsable_id: userId,
        p_zona: input.zona,
        p_numero_mesa: input.numeroMesa ?? null,
        p_notas: input.notas ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_turno_id: input.turnoId ?? null,
        p_items: input.items.map((item) => ({
          receta_id: item.recetaId,
          cantidad: item.cantidad,
          notas: item.notas ?? null,
          area_produccion: itemAreas[item.recetaId] ?? null,
        })),
      });

      if (rpcError) {
        if (rpcError.code === '23505') {
          throw new AppError(
            'DUPLICATE_PEDIDO',
            409,
            'Pedido duplicado: esta operación ya fue registrada',
          );
        }
        throw new AppError('DB_ERROR', 500, rpcError.message);
      }

      // Hidratar el pedido recién creado (lectura, ya persistido atómicamente).
      const { data: pedidoData, error: pedidoError } = await supabase
        .from('pedidos')
        .select(PEDIDO_FLAT_SELECT)
        .eq('id', nuevoPedidoId as string)
        .eq('tenant_id', tenantId)
        .single();
      if (pedidoError) throw new AppError('DB_ERROR', 500, pedidoError.message);

      const { data: itemsData, error: itemsError } = await supabase
        .from('pedido_items')
        .select(
          'id, pedido_id, receta_id, cantidad, notas, area_produccion, estado, en_preparacion_at, listo_at, iniciado_por, listo_por, receta:recetas(nombre)',
        )
        .eq('pedido_id', nuevoPedidoId as string)
        .eq('tenant_id', tenantId);
      if (itemsError) throw new AppError('DB_ERROR', 500, itemsError.message);

      return {
        ...toPedido(pedidoData as unknown as Omit<PedidoRow, 'pedido_items'>),
        items: (itemsData as unknown as ItemRow[]).map(toItem),
        timestamps: buildTimestamps([]),
      };
    },

    async findByIdForDelivery(id: string, tenantId: string): Promise<PedidoForDelivery | null> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(
          `
          id, tenant_id, numero_mesa, zona, estado, version, notas, cocinero_id, created_at, updated_at,
          pedido_items(
            id, pedido_id, receta_id, cantidad, notas, area_produccion,
            estado, en_preparacion_at, listo_at, iniciado_por, listo_por,
            receta:recetas(
              nombre, porciones, tipo_receta,
              receta_ingredientes(insumo_id, cantidad, merma_coeficiente, insumo:insumos(nombre))
            )
          )
        `,
        )
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error?.code === 'PGRST116') return null;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toPedidoForDelivery(data as unknown as PedidoWithIngsRow);
    },

    async transition(
      id: string,
      tenantId: string,
      estado: EstadoPedido,
      version: number,
    ): Promise<Pedido> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .update({ estado, version: version + 1 })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('version', version)
        .select(PEDIDO_FLAT_SELECT)
        .single();

      if (error?.code === 'PGRST116') {
        throw new AppError(
          'VERSION_CONFLICT',
          409,
          'El pedido fue modificado por otro usuario. Recarga e intenta de nuevo.',
        );
      }
      if (error?.code === '23514') {
        throw new AppError('INVALID_TRANSITION', 400, 'Transición de estado no permitida');
      }
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toPedido(data as unknown as Omit<PedidoRow, 'pedido_items'>);
    },

    async asignarCocinero(
      id: string,
      tenantId: string,
      cocineroId: string,
      version: number,
    ): Promise<Pedido> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .update({ cocinero_id: cocineroId, version: version + 1 })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('version', version)
        .select(PEDIDO_FLAT_SELECT)
        .single();

      if (error?.code === 'PGRST116') {
        throw new AppError(
          'VERSION_CONFLICT',
          409,
          'El pedido fue modificado por otro usuario. Recarga e intenta de nuevo.',
        );
      }
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toPedido(data as unknown as Omit<PedidoRow, 'pedido_items'>);
    },

    async findItemForTransition(itemId: string, tenantId: string) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedido_items')
        .select(
          'id, estado, area_produccion, pedido_id, pedidos!inner(estado, version, zona, tenant_id)',
        )
        .eq('id', itemId)
        .eq('pedidos.tenant_id', tenantId)
        .maybeSingle();
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      if (!data) return null;
      const p = data.pedidos as unknown as {
        estado: EstadoPedido;
        version: number;
        zona: ZonaServicio;
      };
      return {
        itemId: data.id as string,
        pedidoId: data.pedido_id as string,
        area: (data.area_produccion ?? null) as AreaProduccion | null,
        estado: (data.estado ?? 'pendiente') as EstadoItem,
        pedidoEstado: p.estado,
        pedidoVersion: p.version,
        zona: p.zona,
      };
    },

    async transitionItem(args: {
      itemId: string;
      pedidoId: string;
      tenantId: string;
      nuevoEstado: EstadoItem;
      actorId: string;
      pedidoVersion: number;
    }): Promise<{ pedidoEstado: EstadoPedido; pedidoVersion: number }> {
      const { itemId, pedidoId, tenantId, nuevoEstado, actorId, pedidoVersion } = args;
      const supabase = await createClient();
      const now = new Date().toISOString();
      const itemPatch: Record<string, unknown> = { estado: nuevoEstado };
      if (nuevoEstado === 'en_preparacion') {
        itemPatch['en_preparacion_at'] = now;
        itemPatch['iniciado_por'] = actorId;
      } else if (nuevoEstado === 'listo') {
        itemPatch['listo_at'] = now;
        itemPatch['listo_por'] = actorId;
      }

      const { error: upErr } = await supabase
        .from('pedido_items')
        .update(itemPatch)
        .eq('id', itemId)
        .eq('pedido_id', pedidoId)
        .eq('tenant_id', tenantId);
      if (upErr) throw new AppError('DB_ERROR', 500, upErr.message);

      const { error: evErr } = await supabase.from('pedido_item_eventos').insert({
        tenant_id: tenantId,
        pedido_id: pedidoId,
        item_id: itemId,
        estado: nuevoEstado,
        actor_id: actorId,
      });
      if (evErr) throw new AppError('DB_ERROR', 500, evErr.message);

      const { data: itemsRows, error: itErr } = await supabase
        .from('pedido_items')
        .select('estado')
        .eq('pedido_id', pedidoId)
        .eq('tenant_id', tenantId);
      if (itErr) throw new AppError('DB_ERROR', 500, itErr.message);

      const { data: pedRow, error: pedErr } = await supabase
        .from('pedidos')
        .select('estado')
        .eq('id', pedidoId)
        .eq('tenant_id', tenantId)
        .single();
      if (pedErr) throw new AppError('DB_ERROR', 500, pedErr.message);

      const nuevoEstadoPedido = estadoPedidoDesdeItems(
        (itemsRows ?? []) as { estado: EstadoItem }[],
        (pedRow?.estado ?? 'recibido_cocina') as EstadoPedido,
      );

      const { data: updated, error: pErr } = await supabase
        .from('pedidos')
        .update({ estado: nuevoEstadoPedido, version: pedidoVersion + 1, updated_at: now })
        .eq('id', pedidoId)
        .eq('tenant_id', tenantId)
        .eq('version', pedidoVersion)
        .select('estado, version')
        .single();
      if (pErr?.code === 'PGRST116') {
        throw new AppError(
          'VERSION_CONFLICT',
          409,
          'El pedido fue modificado por otro usuario. Recarga e intenta de nuevo.',
        );
      }
      // El trigger validate_pedido_estado rechaza transiciones inválidas del pedido
      // con check_violation (23514). Mapear a 400 limpio en vez de DB_ERROR 500.
      if (pErr?.code === '23514') {
        throw new AppError(
          'INVALID_TRANSITION',
          400,
          `Transición de pedido inválida hacia '${nuevoEstadoPedido}'.`,
        );
      }
      if (pErr || !updated) throw new AppError('DB_ERROR', 500, pErr?.message ?? 'Update falló');

      return {
        pedidoEstado: updated.estado as EstadoPedido,
        pedidoVersion: updated.version as number,
      };
    },
  };
}
