import type {
  Pedido,
  PedidoWithItems,
  PedidoForDelivery,
  CreatePedidoInput,
  EstadoPedido,
  EstadoItem,
  AreaProduccion,
} from '../../domain/pedido';

export interface OrderRepository {
  findActive(tenantId: string): Promise<PedidoWithItems[]>;
  findActiveByZona(tenantId: string, zona: string): Promise<PedidoWithItems[]>;
  /** Pedidos activos con al menos un ítem ruteado a un área productiva (KDS por área). */
  findActiveByArea(tenantId: string, area: AreaProduccion): Promise<PedidoWithItems[]>;
  findRecent(tenantId: string, limit: number): Promise<PedidoWithItems[]>;
  /** Área productiva de cada receta (null si no está clasificada). Para ruteo. */
  findRecetaAreas(
    tenantId: string,
    recetaIds: string[],
  ): Promise<Record<string, AreaProduccion | null>>;
  /** `itemAreas`: área destino por recetaId, ya validada por la capa de aplicación. */
  create(
    tenantId: string,
    userId: string,
    input: CreatePedidoInput,
    itemAreas: Record<string, AreaProduccion>,
  ): Promise<PedidoWithItems>;
  findByIdForDelivery(id: string, tenantId: string): Promise<PedidoForDelivery | null>;
  transition(id: string, tenantId: string, estado: EstadoPedido, version: number): Promise<Pedido>;
  /** Asigna (o reasigna) el cocinero a cargo. Optimistic locking por `version`. */
  asignarCocinero(
    id: string,
    tenantId: string,
    cocineroId: string,
    version: number,
  ): Promise<Pedido>;
  /** Carga los datos mínimos de un ítem para validar la transición de estado. */
  findItemForTransition(
    itemId: string,
    tenantId: string,
  ): Promise<{
    itemId: string;
    pedidoId: string;
    area: AreaProduccion | null;
    estado: EstadoItem;
    pedidoEstado: EstadoPedido;
    pedidoVersion: number;
    zona: string;
  } | null>;
  /** Aplica una transición de estado a un ítem y recomputa el estado del pedido. */
  transitionItem(args: {
    itemId: string;
    pedidoId: string;
    tenantId: string;
    nuevoEstado: EstadoItem;
    actorId: string;
    pedidoVersion: number;
  }): Promise<{ pedidoEstado: EstadoPedido; pedidoVersion: number }>;
}
