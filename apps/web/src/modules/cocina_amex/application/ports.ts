import type { Pedido, PedidoWithItems, PedidoEvento, EstadoPedido } from '../domain/pedido-amex';

export interface CocinaAmexRepository {
  findActivosAmex(tenantId: string): Promise<PedidoWithItems[]>;
  findById(tenantId: string, pedidoId: string): Promise<Pedido | null>;
  transition(
    tenantId: string,
    pedidoId: string,
    estado: EstadoPedido,
    version: number,
  ): Promise<Pedido>;
  registrarEvento(
    tenantId: string,
    pedidoId: string,
    estado: EstadoPedido,
    userId: string,
  ): Promise<void>;
  findEventosByPedido(tenantId: string, pedidoId: string): Promise<PedidoEvento[]>;
}
