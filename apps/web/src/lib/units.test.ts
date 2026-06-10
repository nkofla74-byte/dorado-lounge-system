import { describe, it, expect } from 'vitest';
import {
  convertirCantidad,
  sonCompatibles,
  unidadesCompatibles,
  familiaUnidad,
  UnitConversionError,
} from './units';

// Tras el refoco operacional (F2) las unidades válidas son {g, ml, unidad}.
// Cada familia tiene un único miembro canónico, así que la conversión cruzada
// ya no aplica: solo identidad dentro de la misma unidad.

describe('familiaUnidad', () => {
  it('clasifica peso, volumen y discreta', () => {
    expect(familiaUnidad('g')).toBe('peso');
    expect(familiaUnidad('ml')).toBe('volumen');
    expect(familiaUnidad('unidad')).toBe('discreta');
  });
});

describe('sonCompatibles', () => {
  it('misma unidad siempre compatible', () => {
    expect(sonCompatibles('g', 'g')).toBe(true);
    expect(sonCompatibles('ml', 'ml')).toBe(true);
    expect(sonCompatibles('unidad', 'unidad')).toBe(true);
  });

  it('peso ↮ volumen', () => {
    expect(sonCompatibles('g', 'ml')).toBe(false);
  });

  it('discreta no convierte con nada distinto a sí misma', () => {
    expect(sonCompatibles('unidad', 'g')).toBe(false);
    expect(sonCompatibles('unidad', 'ml')).toBe(false);
  });
});

describe('convertirCantidad', () => {
  it('misma unidad no toca el valor', () => {
    expect(convertirCantidad(1500, 'g', 'g')).toBe(1500);
    expect(convertirCantidad(250, 'ml', 'ml')).toBe(250);
    expect(convertirCantidad(3, 'unidad', 'unidad')).toBe(3);
  });

  it('peso ↔ volumen lanza error', () => {
    expect(() => convertirCantidad(1, 'g', 'ml')).toThrow(UnitConversionError);
  });

  it('discreta con unidad distinta lanza error', () => {
    expect(() => convertirCantidad(1, 'unidad', 'g')).toThrow(UnitConversionError);
  });
});

describe('unidadesCompatibles', () => {
  it('peso devuelve solo g', () => {
    expect(unidadesCompatibles('g')).toEqual(['g']);
  });

  it('volumen devuelve solo ml', () => {
    expect(unidadesCompatibles('ml')).toEqual(['ml']);
  });

  it('discreta devuelve solo sí misma', () => {
    expect(unidadesCompatibles('unidad')).toEqual(['unidad']);
  });
});
