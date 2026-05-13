import type { EstadoPedido, ZonaServicio } from '@dorado/shared-types';
import { PEDIDO_TRANSITIONS } from '@dorado/shared-types';

export type { EstadoPedido, ZonaServicio };
export { PEDIDO_TRANSITIONS };

export interface PedidoItem {
  id: string;
  pedidoId: string;
  recetaId: string;
  recetaNombre: string;
  cantidad: number;
  notas: string | null;
}

export interface Pedido {
  id: string;
  tenantId: string;
  numeroMesa: string | null;
  zona: ZonaServicio;
  estado: EstadoPedido;
  version: number;
  notas: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PedidoWithItems extends Pedido {
  items: PedidoItem[];
}

export interface PedidoItemIngrediente {
  insumoId: string;
  insumoNombre: string;
  cantidadPorBatch: number;
  mermaCoeficiente: number;
}

export interface PedidoItemConIngredientes extends PedidoItem {
  recetaPorciones: number;
  ingredientes: PedidoItemIngrediente[];
}

export interface PedidoForDelivery extends Pedido {
  items: PedidoItemConIngredientes[];
}

export type CreatePedidoInput = {
  zona: ZonaServicio;
  numeroMesa?: string | undefined;
  notas?: string | undefined;
  idempotencyKey: string;
  turnoId?: string | undefined;
  items: Array<{
    recetaId: string;
    cantidad: number;
    notas?: string | undefined;
  }>;
};
