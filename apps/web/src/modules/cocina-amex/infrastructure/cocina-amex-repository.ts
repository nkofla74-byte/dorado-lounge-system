import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/result';
import type { CocinaAmexRepository } from '../application/ports';
import type { Pedido, PedidoWithItems, PedidoEvento, EstadoPedido } from '../domain/pedido-amex';
import type { AreaProduccion, EstadoItem } from '@dorado/shared-types';

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
};

const PEDIDO_SELECT = `
  id, tenant_id, numero_mesa, zona, estado, version, notas, cocinero_id, created_at, updated_at,
  pedido_items(id, pedido_id, receta_id, cantidad, notas, area_produccion, estado, en_preparacion_at, listo_at, iniciado_por, listo_por, receta:recetas(nombre))
`;

const PEDIDO_FLAT_SELECT =
  'id, tenant_id, numero_mesa, zona, estado, version, notas, cocinero_id, created_at, updated_at';

function toPedido(row: Omit<PedidoRow, 'pedido_items'>): Pedido {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    numeroMesa: row.numero_mesa,
    zona: row.zona as Pedido['zona'],
    estado: row.estado as EstadoPedido,
    version: row.version,
    notas: row.notas,
    cocineroId: row.cocinero_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toPedidoWithItems(row: PedidoRow): PedidoWithItems {
  // Esta proyección es para el KDS AMEX, que no usa timestamps de transiciones
  // — esos viven en la lista de pedidos para mesero. Stub vacío seguro.
  return {
    ...toPedido(row),
    items: (row.pedido_items ?? []).map((i) => ({
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
    })),
    timestamps: {
      recibidoCocinaAt: null,
      enPreparacionAt: null,
      despachadoAt: null,
      entregadoAt: null,
      canceladoAt: null,
    },
  };
}

export function createCocinaAmexRepository(): CocinaAmexRepository {
  return {
    async findActivosAmex(tenantId: string): Promise<PedidoWithItems[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_SELECT)
        .eq('tenant_id', tenantId)
        .eq('zona', 'amex')
        .is('deleted_at', null)
        .in('estado', ['creado', 'recibido_cocina', 'en_preparacion', 'despachado'])
        .order('created_at', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as PedidoRow[]).map(toPedidoWithItems);
    },

    async findById(tenantId: string, pedidoId: string): Promise<Pedido | null> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_FLAT_SELECT)
        .eq('id', pedidoId)
        .eq('tenant_id', tenantId)
        .single();

      if (error?.code === 'PGRST116') return null;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toPedido(data as unknown as Omit<PedidoRow, 'pedido_items'>);
    },

    async transition(
      tenantId: string,
      pedidoId: string,
      estado: EstadoPedido,
      version: number,
    ): Promise<Pedido> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .update({ estado, version: version + 1 })
        .eq('id', pedidoId)
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

    async registrarEvento(
      tenantId: string,
      pedidoId: string,
      estado: EstadoPedido,
      userId: string,
    ): Promise<void> {
      const admin = createAdminClient();
      await admin.from('pedido_eventos').insert({
        tenant_id: tenantId,
        pedido_id: pedidoId,
        estado,
        actor_id: userId,
      });
    },

    async findEventosByPedido(tenantId: string, pedidoId: string): Promise<PedidoEvento[]> {
      const admin = createAdminClient();

      const { data: rows, error } = await admin
        .from('pedido_eventos')
        .select('id, pedido_id, estado, actor_id, created_at')
        .eq('pedido_id', pedidoId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);

      const actorIds = Array.from(
        new Set((rows ?? []).map((r) => r.actor_id).filter((id): id is string => id != null)),
      );
      let actorMap: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: users } = await admin.from('users').select('id, nombre').in('id', actorIds);
        actorMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.nombre as string]));
      }

      return (rows ?? []).map((r) => ({
        id: r.id,
        pedidoId: r.pedido_id,
        estado: r.estado as PedidoEvento['estado'],
        actorId: r.actor_id,
        actorNombre: r.actor_id ? (actorMap[r.actor_id] ?? null) : null,
        createdAt: new Date(r.created_at),
      }));
    },
  };
}
