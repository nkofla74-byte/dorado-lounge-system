import { describe, it, expect } from 'vitest';
import { PEDIDO_TRANSITIONS } from '../domain/pedido';
import type { EstadoPedido } from '../domain/pedido';

const TODOS_LOS_ESTADOS: EstadoPedido[] = [
  'creado',
  'recibido_cocina',
  'en_preparacion',
  'despachado',
  'entregado',
  'cancelado',
];

describe('PEDIDO_TRANSITIONS — máquina de estados', () => {
  it('todos los estados tienen entrada en la matriz', () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(PEDIDO_TRANSITIONS).toHaveProperty(estado);
    }
  });

  it('flujo feliz: creado → recibido_cocina → en_preparacion → despachado → entregado', () => {
    expect(PEDIDO_TRANSITIONS['creado']).toContain('recibido_cocina');
    expect(PEDIDO_TRANSITIONS['creado']).not.toContain('en_preparacion');
    expect(PEDIDO_TRANSITIONS['recibido_cocina']).toContain('en_preparacion');
    expect(PEDIDO_TRANSITIONS['en_preparacion']).toContain('despachado');
    expect(PEDIDO_TRANSITIONS['despachado']).toContain('entregado');
  });

  it('cancelación es posible desde creado y en_preparacion', () => {
    expect(PEDIDO_TRANSITIONS['creado']).toContain('cancelado');
    expect(PEDIDO_TRANSITIONS['en_preparacion']).toContain('cancelado');
  });

  it('estados terminales no tienen transiciones salientes', () => {
    expect(PEDIDO_TRANSITIONS['entregado']).toHaveLength(0);
    expect(PEDIDO_TRANSITIONS['cancelado']).toHaveLength(0);
  });

  it('no se puede saltar de creado a despachado', () => {
    expect(PEDIDO_TRANSITIONS['creado']).not.toContain('despachado');
  });

  it('no se puede saltar de creado a entregado', () => {
    expect(PEDIDO_TRANSITIONS['creado']).not.toContain('entregado');
  });

  it('no se puede reabrir un pedido entregado', () => {
    expect(PEDIDO_TRANSITIONS['entregado']).not.toContain('creado');
    expect(PEDIDO_TRANSITIONS['entregado']).not.toContain('en_preparacion');
  });

  it('no se puede reabrir un pedido cancelado', () => {
    expect(PEDIDO_TRANSITIONS['cancelado']).not.toContain('creado');
    expect(PEDIDO_TRANSITIONS['cancelado']).not.toContain('en_preparacion');
  });

  it('no hay auto-transiciones en ningún estado', () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(PEDIDO_TRANSITIONS[estado]).not.toContain(estado);
    }
  });

  it('un pedido despachado no puede cancelarse', () => {
    expect(PEDIDO_TRANSITIONS['despachado']).not.toContain('cancelado');
  });

  it('la propiedad isValidTransition se comporta como esperado', () => {
    const isValid = (from: EstadoPedido, to: EstadoPedido) => PEDIDO_TRANSITIONS[from].includes(to);

    expect(isValid('creado', 'recibido_cocina')).toBe(true);
    expect(isValid('creado', 'en_preparacion')).toBe(false);
    expect(isValid('creado', 'entregado')).toBe(false);
    expect(isValid('recibido_cocina', 'en_preparacion')).toBe(true);
    expect(isValid('en_preparacion', 'despachado')).toBe(true);
    expect(isValid('despachado', 'entregado')).toBe(true);
    expect(isValid('entregado', 'cancelado')).toBe(false);
  });
});
