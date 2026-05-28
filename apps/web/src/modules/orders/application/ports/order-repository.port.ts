import type {
  Pedido,
  PedidoWithItems,
  PedidoForDelivery,
  CreatePedidoInput,
  EstadoPedido,
  AreaProduccion,
} from '../../domain/pedido';

export interface OrderRepository {
  findActive(tenantId: string): Promise<PedidoWithItems[]>;
  findActiveByZona(tenantId: string, zona: string): Promise<PedidoWithItems[]>;
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
}
