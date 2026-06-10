import { describe, it, expect } from 'vitest';
import { estadoPedidoDesdeItems } from '../domain/item-estado';
import type { EstadoItem } from '@dorado/shared-types';

const items = (...estados: EstadoItem[]) => estados.map((estado) => ({ estado }));

describe('estadoPedidoDesdeItems', () => {
  it('todos pendiente y pedido ya recibido → recibido_cocina', () => {
    expect(estadoPedidoDesdeItems(items('pendiente', 'pendiente'), 'recibido_cocina')).toBe(
      'recibido_cocina',
    );
  });
  it('todos pendiente y pedido recién creado → creado', () => {
    expect(estadoPedidoDesdeItems(items('pendiente'), 'creado')).toBe('creado');
  });
  it('algún ítem en preparación → en_preparacion', () => {
    expect(estadoPedidoDesdeItems(items('pendiente', 'en_preparacion'), 'recibido_cocina')).toBe(
      'en_preparacion',
    );
  });
  it('todos listo → despachado', () => {
    expect(estadoPedidoDesdeItems(items('listo', 'listo'), 'en_preparacion')).toBe('despachado');
  });
  it('pedido entregado se mantiene (estado terminal)', () => {
    expect(estadoPedidoDesdeItems(items('listo'), 'entregado')).toBe('entregado');
  });
  it('pedido cancelado se mantiene', () => {
    expect(estadoPedidoDesdeItems(items('pendiente'), 'cancelado')).toBe('cancelado');
  });
});
