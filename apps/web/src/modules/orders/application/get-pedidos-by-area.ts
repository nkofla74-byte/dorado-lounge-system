import type { OrderRepository } from './ports/order-repository.port';
import type { PedidoWithItems, AreaProduccion } from '../domain/pedido';

export async function getPedidosByArea(
  repo: OrderRepository,
  tenantId: string,
  area: AreaProduccion,
): Promise<PedidoWithItems[]> {
  return repo.findActiveByArea(tenantId, area);
}
