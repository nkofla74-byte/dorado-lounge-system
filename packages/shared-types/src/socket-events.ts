import type { UserRole, ZonaServicio, EstadoPedido } from './enums';

// ── Canales ───────────────────────────────────────────────────────────────────
// Fuente de verdad del contrato de canales Socket.io.
// Antes de crear un canal nuevo: verificar topología en ARCHITECTURE.md §10.

export const CHANNELS = {
  COCINA: 'sala:cocina',
  AMEX: 'sala:amex',
  SNACK: 'sala:snack',
  BUFFET: 'sala:buffet',
  ADMIN: 'sala:admin',
  STUART_AMEX: 'sala:stuart:amex',
  STUART_SNACK: 'sala:stuart:snack',
  STUART_BUFFET: 'sala:stuart:buffet',
  BROADCAST_COCINA: 'sala:broadcast:cocina',
  BROADCAST_ADMIN: 'sala:broadcast:admin',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

// ── ACL de canales ────────────────────────────────────────────────────────────
// Roles que pueden unirse a cada canal. Un rol ausente = desconexión + audit_log.
export const CHANNEL_ACL: Record<Channel, UserRole[]> = {
  'sala:cocina': ['chef', 'sous_chef', 'admin', 'superuser'],
  'sala:amex': ['mesero_amex', 'admin', 'superuser'],
  'sala:snack': ['personal_snack', 'admin', 'superuser'],
  'sala:buffet': ['personal_buffet', 'admin', 'superuser'],
  'sala:admin': ['admin', 'superuser'],
  'sala:stuart:amex': ['mesero_amex', 'chef', 'sous_chef', 'admin', 'superuser'],
  'sala:stuart:snack': ['personal_snack', 'chef', 'sous_chef', 'admin', 'superuser'],
  'sala:stuart:buffet': ['personal_buffet', 'chef', 'sous_chef', 'admin', 'superuser'],
  'sala:broadcast:cocina': ['chef', 'sous_chef', 'admin', 'superuser'],
  'sala:broadcast:admin': ['admin', 'superuser'],
};

// ── Tipos de eventos ──────────────────────────────────────────────────────────

export interface PedidoCreadoEvent {
  type: 'PEDIDO_CREADO';
  payload: {
    pedidoId: string;
    tenantId: string;
    zona: ZonaServicio;
    numeroMesa?: string;
    items: Array<{ recetaId: string; cantidad: number; nombre: string }>;
    creadoPor: string;
    createdAt: string;
  };
}

export interface PedidoEstadoEvent {
  type: 'PEDIDO_ESTADO';
  payload: {
    pedidoId: string;
    tenantId: string;
    estadoAnterior: EstadoPedido;
    estadoNuevo: EstadoPedido;
    zona: ZonaServicio;
    updatedAt: string;
  };
}

export interface StockOutEvent {
  type: 'STOCK_OUT';
  payload: {
    insumoId: string;
    insumoNombre: string;
    tenantId: string;
    turnoId: string;
    idempotencyKey: string;
    reportadoPor: string;
    createdAt: string;
  };
}

export interface DespachoEvent {
  type: 'DESPACHO';
  payload: {
    despachoId: string;
    tenantId: string;
    recetaId: string;
    zona: ZonaServicio;
    cantidad: number;
    idempotencyKey: string;
    despachoPor: string;
    createdAt: string;
  };
}

export interface MensajeChatEvent {
  type: 'MENSAJE_CHAT';
  payload: {
    mensajeId: string;
    tenantId: string;
    canal: Channel;
    remitenteId: string;
    remitenteNombre: string;
    contenido: string;
    tipo: 'text' | 'image' | 'alert' | 'broadcast';
    createdAt: string;
  };
}

export interface BroadcastEvent {
  type: 'BROADCAST';
  payload: {
    tenantId: string;
    canal: 'sala:broadcast:cocina' | 'sala:broadcast:admin';
    contenido: string;
    emisorId: string;
    createdAt: string;
  };
}

export interface StuartRequestEvent {
  type: 'STUART_REQUEST';
  payload: {
    tenantId: string;
    zona: ZonaServicio;
    solicitanteId: string;
    descripcion: string;
    createdAt: string;
  };
}

export type SocketEvent =
  | PedidoCreadoEvent
  | PedidoEstadoEvent
  | StockOutEvent
  | DespachoEvent
  | MensajeChatEvent
  | BroadcastEvent
  | StuartRequestEvent;

export type SocketEventType = SocketEvent['type'];
