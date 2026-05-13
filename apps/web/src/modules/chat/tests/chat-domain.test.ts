import { describe, it, expect } from 'vitest';
import { validarContenido } from '../domain/mensaje';

describe('Chat domain — validarContenido', () => {
  it('acepta un mensaje normal', () => {
    expect(validarContenido('Hola cocina, listo el pedido')).toBe(true);
  });

  it('rechaza cadena vacía', () => {
    expect(validarContenido('')).toBe(false);
  });

  it('rechaza solo espacios', () => {
    expect(validarContenido('   ')).toBe(false);
  });

  it('rechaza mensaje de más de 1000 caracteres', () => {
    expect(validarContenido('a'.repeat(1001))).toBe(false);
  });

  it('acepta mensaje de exactamente 1000 caracteres', () => {
    expect(validarContenido('a'.repeat(1000))).toBe(true);
  });

  it('acepta mensaje con espacios al inicio/final (se trimea)', () => {
    expect(validarContenido('  hola  ')).toBe(true);
  });
});
