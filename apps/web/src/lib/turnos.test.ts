import { describe, it, expect } from 'vitest';
import { detectarBloqueActual, formatBloqueHorario } from './turnos';

function bogotaDate(hour: number, minute = 0): Date {
  // Bogotá es UTC-5 sin DST. Para construir un Date que aparezca a `hour` en Bogotá,
  // sumamos 5h en UTC.
  return new Date(Date.UTC(2026, 4, 22, hour + 5, minute, 0));
}

describe('detectarBloqueActual', () => {
  it.each([
    [6, '6a2'],
    [10, '6a2'],
    [13, '6a2'],
    [13.99, '6a2'],
  ])('hora %s en Bogotá → 6a2', (h) => {
    expect(detectarBloqueActual(bogotaDate(Math.floor(h), (h % 1) * 60))).toBe('6a2');
  });

  it.each([
    [14, '2a10'],
    [18, '2a10'],
    [21, '2a10'],
  ])('hora %s en Bogotá → 2a10', (h) => {
    expect(detectarBloqueActual(bogotaDate(h))).toBe('2a10');
  });

  it.each([
    [22, '10a6'],
    [23, '10a6'],
    [0, '10a6'],
    [3, '10a6'],
    [5, '10a6'],
  ])('hora %s en Bogotá → 10a6', (h) => {
    expect(detectarBloqueActual(bogotaDate(h))).toBe('10a6');
  });
});

describe('formatBloqueHorario', () => {
  it('formatea cada bloque', () => {
    expect(formatBloqueHorario('6a2')).toBe('06:00 – 14:00');
    expect(formatBloqueHorario('2a10')).toBe('14:00 – 22:00');
    expect(formatBloqueHorario('10a6')).toBe('22:00 – 06:00');
  });
});
