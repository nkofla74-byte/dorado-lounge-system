import { describe, it, expect } from 'vitest';
import {
  severidadStockMinimo,
  severidadCambioPrecio,
  severidadVencimiento,
  severidadDemoraAmex,
  CAMBIO_PRECIO_UMBRAL_NOTIFICAR,
  CAMBIO_PRECIO_UMBRAL_CRITICO,
  DEMORA_AMEX_UMBRAL_CRITICO_MINS,
} from '../domain/alerta';

describe('severidadStockMinimo', () => {
  it('critical cuando el stock es exactamente 0', () => {
    expect(severidadStockMinimo(0)).toBe('critical');
  });

  it('warning cuando el stock es positivo (bajo el mínimo pero no agotado)', () => {
    expect(severidadStockMinimo(0.01)).toBe('warning');
    expect(severidadStockMinimo(1)).toBe('warning');
    expect(severidadStockMinimo(99.99)).toBe('warning');
  });
});

describe('severidadCambioPrecio', () => {
  it('devuelve null si el cambio absoluto es menor al umbral de notificación', () => {
    expect(severidadCambioPrecio(0)).toBeNull();
    expect(severidadCambioPrecio(0.05)).toBeNull();
    expect(severidadCambioPrecio(-0.09)).toBeNull();
  });

  it('warning para cambios entre 10% y 25% (subida o bajada)', () => {
    expect(severidadCambioPrecio(0.1)).toBe('warning');
    expect(severidadCambioPrecio(-0.1)).toBe('warning');
    expect(severidadCambioPrecio(0.2)).toBe('warning');
    expect(severidadCambioPrecio(-0.24)).toBe('warning');
  });

  it('critical para cambios mayores o iguales al 25% (subida o bajada)', () => {
    expect(severidadCambioPrecio(0.25)).toBe('critical');
    expect(severidadCambioPrecio(-0.25)).toBe('critical');
    expect(severidadCambioPrecio(1)).toBe('critical');
    expect(severidadCambioPrecio(-0.9)).toBe('critical');
  });

  it('toma el valor absoluto (el signo del cambio no cambia la severidad)', () => {
    expect(severidadCambioPrecio(0.15)).toBe(severidadCambioPrecio(-0.15));
    expect(severidadCambioPrecio(0.5)).toBe(severidadCambioPrecio(-0.5));
  });

  it('los umbrales exportados coinciden con la implementación', () => {
    expect(CAMBIO_PRECIO_UMBRAL_NOTIFICAR).toBe(0.1);
    expect(CAMBIO_PRECIO_UMBRAL_CRITICO).toBe(0.25);
    expect(CAMBIO_PRECIO_UMBRAL_NOTIFICAR).toBeLessThan(CAMBIO_PRECIO_UMBRAL_CRITICO);
  });
});

describe('severidadVencimiento', () => {
  it('critical si el lote ya venció (días <= 0)', () => {
    expect(severidadVencimiento(0)).toBe('critical');
    expect(severidadVencimiento(-1)).toBe('critical');
    expect(severidadVencimiento(-30)).toBe('critical');
  });

  it('warning si vence en 1 día o menos (pero aún no venció)', () => {
    expect(severidadVencimiento(1)).toBe('warning');
  });

  it('info si vence en más de 1 día', () => {
    expect(severidadVencimiento(2)).toBe('info');
    expect(severidadVencimiento(3)).toBe('info');
    expect(severidadVencimiento(7)).toBe('info');
  });
});

describe('severidadDemoraAmex', () => {
  it('warning para demoras menores al umbral crítico (15-24 min)', () => {
    expect(severidadDemoraAmex(15)).toBe('warning');
    expect(severidadDemoraAmex(20)).toBe('warning');
    expect(severidadDemoraAmex(24)).toBe('warning');
  });

  it('critical para demoras iguales o mayores a 25 min', () => {
    expect(severidadDemoraAmex(25)).toBe('critical');
    expect(severidadDemoraAmex(45)).toBe('critical');
    expect(severidadDemoraAmex(90)).toBe('critical');
  });

  it('el umbral crítico exportado coincide con la implementación', () => {
    expect(DEMORA_AMEX_UMBRAL_CRITICO_MINS).toBe(25);
    expect(severidadDemoraAmex(DEMORA_AMEX_UMBRAL_CRITICO_MINS - 1)).toBe('warning');
    expect(severidadDemoraAmex(DEMORA_AMEX_UMBRAL_CRITICO_MINS)).toBe('critical');
  });
});
