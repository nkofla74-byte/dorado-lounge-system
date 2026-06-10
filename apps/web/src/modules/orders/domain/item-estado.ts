import type { EstadoPedido, EstadoItem } from '@dorado/shared-types';

/** Estados terminales del pedido: no se derivan desde ítems. */
const TERMINALES: EstadoPedido[] = ['entregado', 'cancelado'];

/**
 * Deriva el estado del pedido a partir del estado agregado de sus ítems.
 * Pura. `estadoActual` se usa para respetar estados terminales y distinguir
 * 'creado' de 'recibido_cocina' cuando todos los ítems siguen pendientes.
 */
export function estadoPedidoDesdeItems(
  items: ReadonlyArray<{ estado: EstadoItem }>,
  estadoActual: EstadoPedido,
): EstadoPedido {
  if (TERMINALES.includes(estadoActual)) return estadoActual;
  if (items.length === 0) return estadoActual;

  if (items.every((i) => i.estado === 'listo')) return 'despachado';
  if (items.some((i) => i.estado === 'en_preparacion')) return 'en_preparacion';
  // todos pendiente
  return estadoActual === 'creado' ? 'creado' : 'recibido_cocina';
}
