import { describe, it, expect } from 'vitest';
import {
  UserRole,
  CapaInventario,
  UnidadMedida,
  ZonaServicio,
  EstadoPedido,
  PEDIDO_TRANSITIONS,
  TurnoBloque,
  TURNO_BLOQUE_HORARIOS,
  CategoriaMenu,
  TipoReceta,
  EstadoTanda,
} from '../enums';

describe('UserRole', () => {
  it('contiene los 10 roles del sistema', () => {
    expect(Object.keys(UserRole)).toHaveLength(10);
  });

  const REQUIRED_ROLES = [
    'superuser',
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ];

  it.each(REQUIRED_ROLES)('incluye el rol %s', (role) => {
    expect(UserRole).toHaveProperty(role, role);
  });
});

describe('ZonaServicio', () => {
  it('tiene exactamente 3 zonas', () => {
    expect(Object.keys(ZonaServicio)).toEqual(['amex', 'snack', 'buffet']);
  });
});

describe('EstadoPedido + PEDIDO_TRANSITIONS', () => {
  it('todos los estados tienen entrada en la matriz de transiciones', () => {
    for (const estado of Object.values(EstadoPedido)) {
      expect(PEDIDO_TRANSITIONS).toHaveProperty(estado);
    }
  });

  it('estados terminales no tienen transiciones salientes', () => {
    expect(PEDIDO_TRANSITIONS.entregado).toHaveLength(0);
    expect(PEDIDO_TRANSITIONS.cancelado).toHaveLength(0);
  });

  it('no hay auto-transiciones', () => {
    for (const [estado, targets] of Object.entries(PEDIDO_TRANSITIONS)) {
      expect(targets).not.toContain(estado);
    }
  });

  it('todas las transiciones apuntan a estados válidos', () => {
    const validStates = new Set(Object.values(EstadoPedido));
    for (const targets of Object.values(PEDIDO_TRANSITIONS)) {
      for (const target of targets) {
        expect(validStates.has(target)).toBe(true);
      }
    }
  });
});

describe('TurnoBloque + TURNO_BLOQUE_HORARIOS', () => {
  it('3 bloques cubren las 24 horas', () => {
    expect(Object.keys(TurnoBloque)).toHaveLength(3);
    const horas = Object.values(TURNO_BLOQUE_HORARIOS);
    expect(horas).toHaveLength(3);
  });

  it('cada bloque tiene inicio y fin numéricos', () => {
    for (const { inicio, fin } of Object.values(TURNO_BLOQUE_HORARIOS)) {
      expect(typeof inicio).toBe('number');
      expect(typeof fin).toBe('number');
      expect(inicio).toBeGreaterThanOrEqual(0);
      expect(inicio).toBeLessThan(24);
    }
  });
});

describe('CapaInventario', () => {
  it('tiene capa_1 y capa_2', () => {
    expect(Object.keys(CapaInventario)).toEqual(['capa_1', 'capa_2']);
  });
});

describe('UnidadMedida', () => {
  it('incluye kg, g, lb, l, ml, unidad, porcion', () => {
    expect(Object.keys(UnidadMedida)).toHaveLength(7);
    expect(UnidadMedida).toHaveProperty('kg');
    expect(UnidadMedida).toHaveProperty('lb');
    expect(UnidadMedida).toHaveProperty('porcion');
  });
});

describe('CategoriaMenu', () => {
  it('tiene entrada, plato_fuerte, acompanante', () => {
    expect(Object.keys(CategoriaMenu)).toEqual(['entrada', 'plato_fuerte', 'acompanante']);
  });
});

describe('TipoReceta', () => {
  it('tiene produccion y servicio', () => {
    expect(Object.keys(TipoReceta)).toEqual(['produccion', 'servicio']);
  });
});

describe('EstadoTanda', () => {
  it('tiene 4 estados', () => {
    expect(Object.keys(EstadoTanda)).toEqual([
      'planificada',
      'en_proceso',
      'completada',
      'cancelada',
    ]);
  });
});
