import { describe, it, expect } from 'vitest';
import { calcularDescuentosPedido } from '../application/calcular-descuentos';

describe('calcularDescuentosPedido', () => {
  it('calcula cantidad neta por ítem×ingrediente con idempotency key determinística', () => {
    const descuentos = calcularDescuentosPedido('p1', [
      {
        id: 'i1',
        cantidad: 2,
        recetaPorciones: 4,
        recetaTipo: 'servicio',
        ingredientes: [{ insumoId: 'ins1', insumoNombre: 'Pan', cantidadPorBatch: 100 }],
      },
    ]);

    expect(descuentos).toEqual([
      {
        insumoId: 'ins1',
        insumoNombre: 'Pan',
        cantidad: 50,
        idempotencyKey: 'pedido:p1:item:i1:ing:ins1',
      },
    ]);
  });

  it('aplana múltiples ítems con múltiples ingredientes', () => {
    const descuentos = calcularDescuentosPedido('p1', [
      {
        id: 'i1',
        cantidad: 1,
        recetaPorciones: 2,
        recetaTipo: 'servicio',
        ingredientes: [
          { insumoId: 'ins1', insumoNombre: 'Harina', cantidadPorBatch: 200 },
          { insumoId: 'ins2', insumoNombre: 'Azúcar', cantidadPorBatch: 50 },
        ],
      },
      {
        id: 'i2',
        cantidad: 3,
        recetaPorciones: 6,
        recetaTipo: 'servicio',
        ingredientes: [{ insumoId: 'ins3', insumoNombre: 'Leche', cantidadPorBatch: 300 }],
      },
    ]);

    expect(descuentos).toHaveLength(3);
    expect(descuentos[0]).toMatchObject({ insumoId: 'ins1', cantidad: 100 });
    expect(descuentos[1]).toMatchObject({ insumoId: 'ins2', cantidad: 25 });
    expect(descuentos[2]).toMatchObject({ insumoId: 'ins3', cantidad: 150 });
  });

  it('retorna array vacío si no hay items', () => {
    expect(calcularDescuentosPedido('p1', [])).toEqual([]);
  });

  it('genera idempotency keys únicas por combinación pedido/ítem/ingrediente', () => {
    const descuentos = calcularDescuentosPedido('PED-99', [
      {
        id: 'ITEM-1',
        cantidad: 1,
        recetaPorciones: 1,
        recetaTipo: 'servicio',
        ingredientes: [{ insumoId: 'INS-A', insumoNombre: 'X', cantidadPorBatch: 10 }],
      },
    ]);
    expect(descuentos[0]?.idempotencyKey).toBe('pedido:PED-99:item:ITEM-1:ing:INS-A');
  });

  it('excluye ítems de recetas tipo produccion — el FEFO ya corrió en fn_completar_tanda', () => {
    const descuentos = calcularDescuentosPedido('p1', [
      {
        id: 'i1',
        cantidad: 2,
        recetaPorciones: 1,
        recetaTipo: 'produccion',
        ingredientes: [{ insumoId: 'ins1', insumoNombre: 'Arroz', cantidadPorBatch: 5000 }],
      },
      {
        id: 'i2',
        cantidad: 1,
        recetaPorciones: 4,
        recetaTipo: 'servicio',
        ingredientes: [{ insumoId: 'ins2', insumoNombre: 'Pollo', cantidadPorBatch: 800 }],
      },
    ]);

    expect(descuentos).toHaveLength(1);
    expect(descuentos[0]?.insumoId).toBe('ins2');
    expect(descuentos[0]?.cantidad).toBe(200);
  });

  it('pedido compuesto solo por elaboraciones produce cero descuentos', () => {
    const descuentos = calcularDescuentosPedido('p2', [
      {
        id: 'i1',
        cantidad: 3,
        recetaPorciones: 1,
        recetaTipo: 'produccion',
        ingredientes: [{ insumoId: 'ins1', insumoNombre: 'Arroz', cantidadPorBatch: 5000 }],
      },
    ]);
    expect(descuentos).toHaveLength(0);
  });
});
