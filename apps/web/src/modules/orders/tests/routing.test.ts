import { describe, it, expect } from 'vitest';
import { ZONA_AREAS_PERMITIDAS } from '@dorado/shared-types';
import { zonaPuedeSolicitar, rutearPedido, type ItemRuteable } from '../domain/routing';

describe('ZONA_AREAS_PERMITIDAS (matriz autoritativa)', () => {
  it('cada zona de consumo tiene una entrada', () => {
    expect(ZONA_AREAS_PERMITIDAS).toHaveProperty('amex');
    expect(ZONA_AREAS_PERMITIDAS).toHaveProperty('snack');
    expect(ZONA_AREAS_PERMITIDAS).toHaveProperty('buffet');
  });

  it('AMEX rutea a cocina_fria, cocina AMEX y pastelería (postres de la carta)', () => {
    expect(ZONA_AREAS_PERMITIDAS.amex).toEqual(
      expect.arrayContaining(['cocina_fria', 'amex', 'pasteleria']),
    );
    expect(ZONA_AREAS_PERMITIDAS.amex).not.toContain('cocina_caliente');
  });

  it('Snack y Buffet rutean a caliente, fría y pastelería', () => {
    for (const zona of ['snack', 'buffet'] as const) {
      expect(ZONA_AREAS_PERMITIDAS[zona]).toEqual(
        expect.arrayContaining(['cocina_caliente', 'cocina_fria', 'pasteleria']),
      );
    }
  });

  it('el área cocina AMEX (amex) sirve EXCLUSIVAMENTE a la zona AMEX', () => {
    expect(ZONA_AREAS_PERMITIDAS.snack).not.toContain('amex');
    expect(ZONA_AREAS_PERMITIDAS.buffet).not.toContain('amex');
  });
});

describe('zonaPuedeSolicitar', () => {
  it('permite combinaciones válidas', () => {
    expect(zonaPuedeSolicitar('snack', 'cocina_caliente')).toBe(true);
    expect(zonaPuedeSolicitar('amex', 'cocina_fria')).toBe(true);
    expect(zonaPuedeSolicitar('amex', 'amex')).toBe(true);
    expect(zonaPuedeSolicitar('amex', 'pasteleria')).toBe(true);
  });

  it('rechaza combinaciones fuera de la matriz', () => {
    expect(zonaPuedeSolicitar('amex', 'cocina_caliente')).toBe(false);
    expect(zonaPuedeSolicitar('snack', 'amex')).toBe(false);
    expect(zonaPuedeSolicitar('buffet', 'cocina')).toBe(false); // legacy inerte
  });
});

describe('rutearPedido', () => {
  const item = (id: string, area: ItemRuteable['areaProduccion']): ItemRuteable => ({
    recetaId: id,
    areaProduccion: area,
  });

  it('agrupa ítems por área destino única (pedido mixto)', () => {
    const r = rutearPedido('snack', [
      item('a', 'cocina_caliente'),
      item('b', 'pasteleria'),
      item('c', 'cocina_caliente'), // duplicado de área
    ]);
    expect(r.areas.sort()).toEqual(['cocina_caliente', 'pasteleria']);
    expect(r.itemsSinArea).toHaveLength(0);
    expect(r.areasNoPermitidas).toHaveLength(0);
  });

  it('detecta ítems sin área de producción en su receta', () => {
    const r = rutearPedido('buffet', [item('a', 'cocina_fria'), item('b', null)]);
    expect(r.itemsSinArea).toEqual(['b']);
  });

  it('detecta áreas no permitidas para la zona', () => {
    const r = rutearPedido('amex', [item('a', 'cocina_fria'), item('b', 'cocina_caliente')]);
    expect(r.areasNoPermitidas).toEqual(['cocina_caliente']);
  });
});
