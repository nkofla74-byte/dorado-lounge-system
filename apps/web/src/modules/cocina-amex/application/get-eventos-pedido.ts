import type { PedidoEvento } from '../domain/pedido-amex';
import type { CocinaAmexRepository } from './ports';

export async function getEventosPedido(
  repo: CocinaAmexRepository,
  tenantId: string,
  pedidoId: string,
): Promise<PedidoEvento[]> {
  return repo.findEventosByPedido(tenantId, pedidoId);
}
