import type { PedidoWithItems } from '../domain/pedido-amex';
import type { CocinaAmexRepository } from './ports';

export async function getPedidosAmex(
  repo: CocinaAmexRepository,
  tenantId: string,
): Promise<PedidoWithItems[]> {
  return repo.findActivosAmex(tenantId);
}
