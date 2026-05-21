import { describe, it, expect } from 'vitest';
import {
  convertirCantidad,
  sonCompatibles,
  unidadesCompatibles,
  familiaUnidad,
  UnitConversionError,
} from './units';

describe('familiaUnidad', () => {
  it('clasifica peso, volumen y discreta', () => {
    expect(familiaUnidad('g')).toBe('peso');
    expect(familiaUnidad('kg')).toBe('peso');
    expect(familiaUnidad('lb')).toBe('peso');
    expect(familiaUnidad('ml')).toBe('volumen');
    expect(familiaUnidad('l')).toBe('volumen');
    expect(familiaUnidad('unidad')).toBe('discreta');
    expect(familiaUnidad('porcion')).toBe('discreta');
  });
});

describe('sonCompatibles', () => {
  it('misma unidad siempre compatible', () => {
    expect(sonCompatibles('g', 'g')).toBe(true);
    expect(sonCompatibles('unidad', 'unidad')).toBe(true);
  });

  it('peso ↔ peso compatible', () => {
    expect(sonCompatibles('g', 'kg')).toBe(true);
    expect(sonCompatibles('kg', 'lb')).toBe(true);
  });

  it('volumen ↔ volumen compatible', () => {
    expect(sonCompatibles('ml', 'l')).toBe(true);
  });

  it('peso ↮ volumen', () => {
    expect(sonCompatibles('g', 'ml')).toBe(false);
    expect(sonCompatibles('kg', 'l')).toBe(false);
  });

  it('discreta no convierte con nada distinto a sí misma', () => {
    expect(sonCompatibles('unidad', 'g')).toBe(false);
    expect(sonCompatibles('porcion', 'unidad')).toBe(false);
  });
});

describe('convertirCantidad', () => {
  it('misma unidad no toca el valor', () => {
    expect(convertirCantidad(1500, 'g', 'g')).toBe(1500);
  });

  it('kg → g multiplica por 1000', () => {
    expect(convertirCantidad(1.5, 'kg', 'g')).toBe(1500);
  });

  it('g → kg divide por 1000', () => {
    expect(convertirCantidad(1500, 'g', 'kg')).toBe(1.5);
  });

  it('l → ml multiplica por 1000', () => {
    expect(convertirCantidad(1, 'l', 'ml')).toBe(1000);
  });

  it('lb → g usa factor 453.59237', () => {
    expect(convertirCantidad(1, 'lb', 'g')).toBeCloseTo(453.59237, 5);
  });

  it('peso ↔ volumen lanza error', () => {
    expect(() => convertirCantidad(1, 'g', 'ml')).toThrow(UnitConversionError);
  });

  it('discreta con unidad distinta lanza error', () => {
    expect(() => convertirCantidad(1, 'unidad', 'g')).toThrow(UnitConversionError);
  });
});

describe('unidadesCompatibles', () => {
  it('peso devuelve g/kg/lb', () => {
    expect(unidadesCompatibles('g').sort()).toEqual(['g', 'kg', 'lb']);
  });

  it('volumen devuelve ml/l', () => {
    expect(unidadesCompatibles('ml').sort()).toEqual(['l', 'ml']);
  });

  it('discreta devuelve solo sí misma', () => {
    expect(unidadesCompatibles('unidad')).toEqual(['unidad']);
    expect(unidadesCompatibles('porcion')).toEqual(['porcion']);
  });
});
