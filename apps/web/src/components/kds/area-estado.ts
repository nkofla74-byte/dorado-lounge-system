import type { PedidoWithItems, AreaProduccion } from '@/modules/orders/domain/pedido';

/**
 * Classifies a pedido into a KDS column based on the state of its items
 * for a given production area.
 *
 * - 'despachado'     → no items for this area, OR all items are 'listo'
 * - 'en_preparacion' → at least one item is 'en_preparacion'
 * - 'creado'         → all items are 'pendiente'
 */
export function estadoAreaDePedido(
  pedido: PedidoWithItems,
  area: AreaProduccion,
): 'creado' | 'en_preparacion' | 'despachado' {
  const items = pedido.items.filter((i) => i.areaProduccion === area);
  if (items.length === 0) return 'despachado';
  if (items.every((i) => i.estado === 'listo')) return 'despachado';
  if (items.some((i) => i.estado === 'en_preparacion')) return 'en_preparacion';
  return 'creado';
}
