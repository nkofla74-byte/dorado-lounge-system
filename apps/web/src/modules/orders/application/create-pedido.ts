import type { OrderRepository } from './ports/order-repository.port';
import type { PedidoWithItems, CreatePedidoInput } from '../domain/pedido';

export async function createPedido(
  repo: OrderRepository,
  tenantId: string,
  userId: string,
  input: CreatePedidoInput,
): Promise<PedidoWithItems> {
  return repo.create(tenantId, userId, input);
}
