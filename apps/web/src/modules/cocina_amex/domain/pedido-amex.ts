// Re-exporta los tipos del dominio de pedidos relevantes para el KDS AMEX.
// El módulo cocina_amex no define entidades propias — opera sobre pedidos,
// pero con permisos y contexto exclusivos del sous_chef.
export type {
  Pedido,
  PedidoWithItems,
  PedidoItem,
  PedidoEvento,
  EstadoPedido,
} from '@/modules/orders/domain/pedido';
export { PEDIDO_TRANSITIONS } from '@/modules/orders/domain/pedido';

// Umbrales de alerta para el KDS AMEX
export const AMEX_URGENCY_WARN_MINS = 8;
export const AMEX_URGENCY_CRIT_MINS = 15;
