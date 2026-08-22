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

/**
 * Traduce el SQLSTATE de una RPC de pedidos a un AppError del dominio.
 *
 * Toda la escritura de pedidos pasa por RPCs SECURITY DEFINER que autorizan y
 * validan dentro de la propia transacción (migración 20260822000005), así que
 * los errores de negocio llegan como códigos de PostgreSQL en vez de como
 * comprobaciones previas en TypeScript.
 */
function errorDeRpcPedido(error: { code?: string; message?: string }): AppError {
  switch (error.code) {
    case '40001': // serialization_failure
      return new AppError(
        'VERSION_CONFLICT',
        409,
        'El pedido fue modificado por otro usuario. Recarga e intenta de nuevo.',
      );
    case 'P0001': // stock insuficiente (fn_descontar_insumo_fefo)
      return new AppError('STOCK_INSUFICIENTE', 409, error.message ?? 'Stock insuficiente');
    case '42501': // insufficient_privilege
      return new AppError('FORBIDDEN', 403, error.message ?? 'Operación no permitida');
    case '23514': // check_violation
    case 'P0002': // raise ... no_data_found no siempre mapea, se cubre abajo
      return new AppError('INVALID_TRANSITION', 400, error.message ?? 'Operación inválida');
    case '02000': // no_data_found
      return new AppError('NOT_FOUND', 404, 'Pedido no encontrado');
    default:
      return new AppError('DB_ERROR', 500, error.message ?? 'Error de base de datos');
  }
}

export { errorDeRpcPedido };

/** Relee el pedido tras una RPC que ya lo persistió. */
async function releerPedido(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<Pedido> {
  const { data, error } = await supabase
    .from('pedidos')
    .select(PEDIDO_FLAT_SELECT)
    .eq('id', id)
    .single();

  if (error) throw new AppError('DB_ERROR', 500, error.message);
  return toPedido(data as unknown as Omit<PedidoRow, 'pedido_items'>);
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
      _tenantId: string,
      estado: EstadoPedido,
      version: number,
    ): Promise<Pedido> {
      const supabase = await createClient();
      const { error } = await supabase.rpc('fn_pedido_transicion', {
        p_pedido_id: id,
        p_estado: estado,
        p_version: version,
      });
      if (error) throw errorDeRpcPedido(error);

      return releerPedido(supabase, id);
    },

    async entregar(id: string, _tenantId: string, version: number): Promise<Pedido> {
      const supabase = await createClient();
      // Descuento FEFO de todos los ingredientes + transición, en una sola
      // transacción de Postgres. Antes eran N llamadas independientes seguidas
      // de un update con locking optimista: un fallo intermedio dejaba stock
      // descontado sin pedido entregado (F-008).
      const { error } = await supabase.rpc('fn_entregar_pedido', {
        p_pedido_id: id,
        p_version: version,
      });
      if (error) throw errorDeRpcPedido(error);

      return releerPedido(supabase, id);
    },

    async asignarCocinero(
      id: string,
      _tenantId: string,
      cocineroId: string,
      version: number,
    ): Promise<Pedido> {
      const supabase = await createClient();
      const { error } = await supabase.rpc('fn_pedido_asignar_cocinero', {
        p_pedido_id: id,
        p_cocinero_id: cocineroId,
        p_version: version,
      });
      if (error) throw errorDeRpcPedido(error);

      return releerPedido(supabase, id);
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
      nuevoEstado: EstadoItem;
      pedidoVersion: number;
    }): Promise<{ pedidoEstado: EstadoPedido; pedidoVersion: number }> {
      const supabase = await createClient();

      // Ítem, evento y estado agregado del pedido en una sola transacción, con
      // el pedido bloqueado desde el inicio. Antes eran cuatro round-trips y el
      // control de versión llegaba el último: un 409 dejaba el ítem ya cambiado
      // en base (F-009).
      const { data, error } = await supabase.rpc('fn_transicionar_item', {
        p_item_id: args.itemId,
        p_estado: args.nuevoEstado,
        p_version: args.pedidoVersion,
      });
      if (error) throw errorDeRpcPedido(error);

      const resultado = data as { pedido_estado: EstadoPedido; pedido_version: number };
      return {
        pedidoEstado: resultado.pedido_estado,
        pedidoVersion: resultado.pedido_version,
      };
    },
  };
}
