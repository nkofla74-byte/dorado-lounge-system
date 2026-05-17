import { describe, it, expect } from 'vitest';
import { costoRecetaFromRpcRow } from '../domain/costo';

function makeRpcRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    receta_id: 'receta-1',
    porciones: 4,
    costo_total: 12000.5,
    costo_por_porcion: 3000.125,
    tiene_costo_completo: true,
    ingredientes: [],
    ...overrides,
  };
}

function makeRpcIngrediente(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    insumo_id: 'insumo-1',
    insumo_nombre: 'Harina',
    unidad_medida: 'kg',
    cantidad: '0.5',
    merma_coeficiente: '0.1',
    cantidad_bruta: '0.5556',
    precio_unitario: '8000',
    costo_ingrediente: '4444.8',
    ...overrides,
  };
}

describe('costoRecetaFromRpcRow', () => {
  it('mapea campos snake_case a camelCase preservando los valores', () => {
    const row = makeRpcRow();
    const costo = costoRecetaFromRpcRow(row);

    expect(costo.recetaId).toBe('receta-1');
    expect(costo.porciones).toBe(4);
    expect(costo.costoTotal).toBe(12000.5);
    expect(costo.costoPorPorcion).toBe(3000.125);
    expect(costo.tieneCostoCompleto).toBe(true);
    expect(costo.ingredientes).toEqual([]);
  });

  it('coerce numéricos string (Postgres numeric) a number', () => {
    const row = makeRpcRow({
      porciones: '8',
      costo_total: '15000.75',
      costo_por_porcion: '1875.09375',
    });
    const costo = costoRecetaFromRpcRow(row);

    expect(costo.porciones).toBe(8);
    expect(costo.costoTotal).toBe(15000.75);
    expect(costo.costoPorPorcion).toBe(1875.09375);
  });

  it('costo_por_porcion null se preserva como null', () => {
    const costo = costoRecetaFromRpcRow(makeRpcRow({ costo_por_porcion: null }));
    expect(costo.costoPorPorcion).toBeNull();
  });

  it('costo_total ausente o null se trata como 0', () => {
    expect(costoRecetaFromRpcRow(makeRpcRow({ costo_total: null })).costoTotal).toBe(0);
    expect(costoRecetaFromRpcRow(makeRpcRow({ costo_total: undefined })).costoTotal).toBe(0);
  });

  it('tieneCostoCompleto false cuando faltan precios', () => {
    const costo = costoRecetaFromRpcRow(makeRpcRow({ tiene_costo_completo: false }));
    expect(costo.tieneCostoCompleto).toBe(false);
  });

  it('mapea ingredientes con coerción numérica', () => {
    const row = makeRpcRow({ ingredientes: [makeRpcIngrediente()] });
    const costo = costoRecetaFromRpcRow(row);

    expect(costo.ingredientes).toHaveLength(1);
    const ing = costo.ingredientes[0]!;
    expect(ing.insumoId).toBe('insumo-1');
    expect(ing.insumoNombre).toBe('Harina');
    expect(ing.unidadMedida).toBe('kg');
    expect(ing.cantidad).toBe(0.5);
    expect(ing.mermaCoeficiente).toBe(0.1);
    expect(ing.cantidadBruta).toBeCloseTo(0.5556, 4);
    expect(ing.precioUnitario).toBe(8000);
    expect(ing.costoIngrediente).toBeCloseTo(4444.8, 1);
  });

  it('preserva null en precio_unitario y costo_ingrediente cuando vienen null', () => {
    const row = makeRpcRow({
      ingredientes: [makeRpcIngrediente({ precio_unitario: null, costo_ingrediente: null })],
    });
    const ing = costoRecetaFromRpcRow(row).ingredientes[0]!;
    expect(ing.precioUnitario).toBeNull();
    expect(ing.costoIngrediente).toBeNull();
  });

  it('mapea múltiples ingredientes manteniendo el orden', () => {
    const row = makeRpcRow({
      ingredientes: [
        makeRpcIngrediente({ insumo_id: 'a', insumo_nombre: 'A' }),
        makeRpcIngrediente({ insumo_id: 'b', insumo_nombre: 'B' }),
        makeRpcIngrediente({ insumo_id: 'c', insumo_nombre: 'C' }),
      ],
    });
    const ingredientes = costoRecetaFromRpcRow(row).ingredientes;
    expect(ingredientes.map((i) => i.insumoId)).toEqual(['a', 'b', 'c']);
  });

  it('devuelve ingredientes vacío si la propiedad no es un array', () => {
    expect(costoRecetaFromRpcRow(makeRpcRow({ ingredientes: null })).ingredientes).toEqual([]);
    expect(costoRecetaFromRpcRow(makeRpcRow({ ingredientes: undefined })).ingredientes).toEqual([]);
  });
});
