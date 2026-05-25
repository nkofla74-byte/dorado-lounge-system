import type {
  Pedido,
  PedidoWithItems,
  PedidoForDelivery,
  CreatePedidoInput,
  EstadoPedido,
} from '../../domain/pedido';

export interface OrderRepository {
  findActive(tenantId: string): Promise<PedidoWithItems[]>;
  findActiveByZona(tenantId: string, zona: string): Promise<PedidoWithItems[]>;
  findRecent(tenantId: string, limit: number): Promise<PedidoWithItems[]>;
  create(tenantId: string, userId: string, input: CreatePedidoInput): Promise<PedidoWithItems>;
  findByIdForDelivery(id: string, tenantId: string): Promise<PedidoForDelivery | null>;
  transition(id: string, tenantId: string, estado: EstadoPedido, version: number): Promise<Pedido>;
}
