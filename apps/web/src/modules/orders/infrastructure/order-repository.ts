import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { OrderRepository } from '../application/ports/order-repository.port';
import type {
  Pedido,
  PedidoItem,
  PedidoWithItems,
  PedidoForDelivery,
  PedidoItemConIngredientes,
  CreatePedidoInput,
  EstadoPedido,
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
  receta: {
    nombre: string;
    porciones: number;
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
  id, tenant_id, numero_mesa, zona, estado, version, notas, created_at, updated_at,
  pedido_items(id, pedido_id, receta_id, cantidad, notas, area_produccion, receta:recetas(nombre)),
  pedido_eventos(estado, created_at)
`;

const PEDIDO_FLAT_SELECT =
  'id, tenant_id, numero_mesa, zona, estado, version, notas, created_at, updated_at';

function toPedido(row: Omit<PedidoRow, 'pedido_items'>): Pedido {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    numeroMesa: row.numero_mesa,
    zona: row.zona as ZonaServicio,
    estado: row.estado as EstadoPedido,
    version: row.version,
    notas: row.notas,
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
    recetaPorciones: i.receta?.porciones ?? 1,
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

      const { data: pedidoData, error: pedidoError } = await supabase
        .from('pedidos')
        .insert({
          tenant_id: tenantId,
          responsable_id: userId,
          zona: input.zona,
          numero_mesa: input.numeroMesa ?? null,
          notas: input.notas ?? null,
          idempotency_key: input.idempotencyKey,
          turno_id: input.turnoId ?? null,
        })
        .select(PEDIDO_FLAT_SELECT)
        .single();

      if (pedidoError) {
        if (pedidoError.code === '23505') {
          throw new AppError(
            'DUPLICATE_PEDIDO',
            409,
            'Pedido duplicado: esta operación ya fue registrada',
          );
        }
        throw new AppError('DB_ERROR', 500, pedidoError.message);
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from('pedido_items')
        .insert(
          input.items.map((item) => ({
            tenant_id: tenantId,
            pedido_id: pedidoData.id,
            receta_id: item.recetaId,
            cantidad: item.cantidad,
            notas: item.notas ?? null,
            area_produccion: itemAreas[item.recetaId] ?? null,
          })),
        )
        .select(
          'id, pedido_id, receta_id, cantidad, notas, area_produccion, receta:recetas(nombre)',
        );

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
          id, tenant_id, numero_mesa, zona, estado, version, notas, created_at, updated_at,
          pedido_items(
            id, pedido_id, receta_id, cantidad, notas, area_produccion,
            receta:recetas(
              nombre, porciones,
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
  };
}
