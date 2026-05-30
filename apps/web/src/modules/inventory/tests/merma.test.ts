import { describe, it, expect } from 'vitest';
import {
  cantidadConMerma,
  mermaAbsoluta,
  aplicarMermaRecepcion,
  costoUnitarioNeto,
  MermaError,
} from '../domain/merma';

describe('cantidadConMerma', () => {
  // ── Casos normales ──────────────────────────────────────────────────────────

  it('sin merma devuelve la cantidad requerida intacta', () => {
    expect(cantidadConMerma(100, 0)).toBe(100);
  });

  it('merma 10%: 100g requiere descontar 111.1111g', () => {
    // 100 / (1 - 0.1) = 100 / 0.9 = 111.1111...
    expect(cantidadConMerma(100, 0.1)).toBe(111.1111);
  });

  it('merma 50%: duplica la cantidad a descontar', () => {
    // 100 / 0.5 = 200
    expect(cantidadConMerma(100, 0.5)).toBe(200);
  });

  it('merma 25%: 100g → 133.3333g', () => {
    // 100 / 0.75 = 133.3333...
    expect(cantidadConMerma(100, 0.25)).toBe(133.3333);
  });

  it('merma 33.3%: redondea correctamente a 4 decimales', () => {
    // 100 / (1 - 0.333) = 100 / 0.667 = 149.9250...
    expect(cantidadConMerma(100, 0.333)).toBe(149.925);
  });

  it('coeficiente muy pequeño se aplica correctamente', () => {
    // 100 / (1 - 0.01) = 100 / 0.99 = 101.0101...
    expect(cantidadConMerma(100, 0.01)).toBe(101.0101);
  });

  it('coeficiente máximo tolerable (0.9999) no explota', () => {
    // 1 / 0.0001 = 10000
    expect(cantidadConMerma(1, 0.9999)).toBe(10000);
  });

  it('cantidad cero siempre devuelve cero, sin importar el coeficiente', () => {
    expect(cantidadConMerma(0, 0)).toBe(0);
    expect(cantidadConMerma(0, 0.5)).toBe(0);
    expect(cantidadConMerma(0, 0.9)).toBe(0);
  });

  it('cantidad fraccionaria se maneja correctamente', () => {
    // 0.5 / 0.9 = 0.5555...
    expect(cantidadConMerma(0.5, 0.1)).toBe(0.5556);
  });

  it('preserva precisión de 4 decimales', () => {
    const result = cantidadConMerma(1, 0.1); // 1 / 0.9 = 1.1111...
    expect(result).toBe(1.1111);
  });

  // ── Validaciones de entrada ─────────────────────────────────────────────────

  it('lanza MermaError si coeficiente es exactamente 1 (división por cero)', () => {
    expect(() => cantidadConMerma(100, 1)).toThrow(MermaError);
    expect(() => cantidadConMerma(100, 1)).toThrow('coeficiente debe estar en [0, 1)');
  });

  it('lanza MermaError si coeficiente es mayor que 1', () => {
    expect(() => cantidadConMerma(100, 1.5)).toThrow(MermaError);
  });

  it('lanza MermaError si coeficiente es negativo', () => {
    expect(() => cantidadConMerma(100, -0.1)).toThrow(MermaError);
    expect(() => cantidadConMerma(100, -1)).toThrow(MermaError);
  });

  it('lanza MermaError si cantidadRequerida es negativa', () => {
    expect(() => cantidadConMerma(-1, 0.1)).toThrow(MermaError);
    expect(() => cantidadConMerma(-100, 0)).toThrow(MermaError);
  });

  it('el error indica claramente el valor recibido', () => {
    expect(() => cantidadConMerma(100, 1.2)).toThrow('1.2');
    expect(() => cantidadConMerma(-5, 0.1)).toThrow('-5');
  });

  // ── Propiedad matemática: cantidadConMerma(req, 0) === req ──────────────────

  it('propiedad: coeficiente 0 es identidad para cualquier cantidad positiva', () => {
    const valores = [0.001, 1, 10, 100, 999.5, 10000];
    for (const v of valores) {
      expect(cantidadConMerma(v, 0)).toBe(v);
    }
  });

  // ── Propiedad: resultado siempre >= cantidadRequerida ──────────────────────

  it('propiedad: el resultado siempre es >= la cantidad requerida', () => {
    const coeficientes = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9];
    for (const c of coeficientes) {
      expect(cantidadConMerma(100, c)).toBeGreaterThanOrEqual(100);
    }
  });
});

describe('mermaAbsoluta', () => {
  it('sin merma la pérdida absoluta es cero', () => {
    expect(mermaAbsoluta(100, 0)).toBe(0);
  });

  it('merma 10% de 100g resulta en ~11.1111g de pérdida', () => {
    expect(mermaAbsoluta(100, 0.1)).toBe(11.1111);
  });

  it('merma 50% de 100g resulta en 100g de pérdida', () => {
    expect(mermaAbsoluta(100, 0.5)).toBe(100);
  });

  it('cantidad cero produce pérdida cero', () => {
    expect(mermaAbsoluta(0, 0.5)).toBe(0);
  });

  it('lanza MermaError con coeficiente inválido', () => {
    expect(() => mermaAbsoluta(100, 1)).toThrow(MermaError);
  });

  it('propiedad: mermaAbsoluta + cantidadRequerida === cantidadConMerma', () => {
    const coeficientes = [0, 0.1, 0.25, 0.5, 0.75];
    for (const c of coeficientes) {
      const bruto = cantidadConMerma(100, c);
      const merma = mermaAbsoluta(100, c);
      // Tolerancia por redondeo de 4 decimales
      expect(Math.abs(merma + 100 - bruto)).toBeLessThan(0.0002);
    }
  });
});

describe('aplicarMermaRecepcion (modelo F3: merma en recepción)', () => {
  it('sin merma devuelve la cantidad comprada intacta', () => {
    expect(aplicarMermaRecepcion(10000, 0)).toBe(10000);
  });

  it('merma 15%: 10 kg comprados → 8.5 kg netos', () => {
    expect(aplicarMermaRecepcion(10000, 0.15)).toBe(8500);
  });

  it('merma 10%: 60 piezas → 54 netas', () => {
    expect(aplicarMermaRecepcion(60, 0.1)).toBe(54);
  });

  it('redondea a 4 decimales', () => {
    // 100 × (1 - 0.333) = 66.7
    expect(aplicarMermaRecepcion(100, 0.333)).toBe(66.7);
  });

  it('cantidad cero produce cero', () => {
    expect(aplicarMermaRecepcion(0, 0.2)).toBe(0);
  });

  it('lanza MermaError con comprado negativo', () => {
    expect(() => aplicarMermaRecepcion(-1, 0.1)).toThrow(MermaError);
  });

  it('lanza MermaError con coeficiente fuera de rango', () => {
    expect(() => aplicarMermaRecepcion(100, 1)).toThrow(MermaError);
    expect(() => aplicarMermaRecepcion(100, -0.1)).toThrow(MermaError);
  });
});

describe('costoUnitarioNeto (preserva valor total del lote)', () => {
  it('sin merma el costo no cambia', () => {
    expect(costoUnitarioNeto(10, 0)).toBe(10);
  });

  it('merma 15%: costo bruto 10 → neto 11.7647', () => {
    // 10 / (1 - 0.15) = 11.76470… → 11.7647
    expect(costoUnitarioNeto(10, 0.15)).toBe(11.7647);
  });

  it('preserva valor total: comprado×costoBruto === neto×costoNeto', () => {
    const comprado = 10000;
    const costoBruto = 28.5;
    for (const c of [0, 0.05, 0.1, 0.15]) {
      const neto = aplicarMermaRecepcion(comprado, c);
      const costoNeto = costoUnitarioNeto(costoBruto, c);
      expect(Math.abs(neto * costoNeto - comprado * costoBruto)).toBeLessThan(0.5);
    }
  });

  it('costo cero produce cero', () => {
    expect(costoUnitarioNeto(0, 0.2)).toBe(0);
  });

  it('lanza MermaError con costo negativo o coeficiente inválido', () => {
    expect(() => costoUnitarioNeto(-1, 0.1)).toThrow(MermaError);
    expect(() => costoUnitarioNeto(10, 1)).toThrow(MermaError);
  });
});
