import type { OrderRepository } from './ports/order-repository.port';
import type { PedidoWithItems } from '../domain/pedido';

export async function getPedidos(
  repo: OrderRepository,
  tenantId: string,
): Promise<PedidoWithItems[]> {
  return repo.findActive(tenantId);
}
