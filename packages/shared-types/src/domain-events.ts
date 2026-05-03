import type { ZonaServicio, EstadoPedido, CategoriaMerma } from './enums';

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  tenantId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: T;
  createdBy?: string;
  createdAt: string;
}

export interface PedidoCreadoPayload {
  pedidoId: string;
  zona: ZonaServicio;
  numeroMesa?: string;
  items: Array<{ recetaId: string; cantidad: number }>;
}

export interface PedidoTransicionadoPayload {
  pedidoId: string;
  estadoAnterior: EstadoPedido;
  estadoNuevo: EstadoPedido;
  zona: ZonaServicio;
}

export interface StockOutPayload {
  insumoId: string;
  cantidad: number;
  idempotencyKey: string;
  turnoId: string;
}

export interface DespachoEjecutadoPayload {
  despachoId: string;
  recetaId: string;
  zona: ZonaServicio;
  cantidad: number;
  idempotencyKey: string;
}

export interface MermaRegistradaPayload {
  mermaId: string;
  insumoId: string;
  cantidad: number;
  categoria: CategoriaMerma;
  idempotencyKey: string;
}

export interface TandaCompletadaPayload {
  tandaId: string;
  recetaId: string;
  cantidadTandas: number;
}
