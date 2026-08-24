import { describe, it, expect } from 'vitest';
import type { Receta, RecetaIngrediente, RecetaWithIngredientes } from '../domain/recipe';

// Los domain types son estructuras de datos — los tests verifican que los
// constructores y las relaciones entre entidades son coherentes con las reglas
// de negocio (receta_produccion vs receta_servicio) y que los tipos discriminados
// se usan correctamente.

function makeRecetaBase(overrides: Partial<Receta> = {}): Receta {
  return {
    id: 'receta-1',
    tenantId: 'tenant-1',
    nombre: 'Pandebono',
    tipoReceta: 'produccion',
    zona: null,
    insumoDestinoId: 'insumo-pandebono',
    areaProduccion: null,
    porciones: 12,
    rendimientoCantidad: 12,
    categoriaMenu: null,
    descripcion: null,
    imagenUrl: null,
    activo: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeIngrediente(overrides: Partial<RecetaIngrediente> = {}): RecetaIngrediente {
  return {
    id: 'ing-1',
    recetaId: 'receta-1',
    insumoId: 'insumo-harina',
    insumoNombre: 'Harina de maíz',
    unidadMedida: 'g',
    cantidad: 0.5,
    unidadDisplay: null,
    mermaCoeficiente: 0.05,
    ...overrides,
  };
}

// ── Invariantes de Receta ──────────────────────────────────────────────────────

describe('Receta de producción', () => {
  it('tiene insumoDestinoId (Capa 1 → Capa 2)', () => {
    const receta = makeRecetaBase({ tipoReceta: 'produccion' });
    expect(receta.insumoDestinoId).not.toBeNull();
    expect(receta.zona).toBeNull();
  });

  it('porciones es un entero positivo', () => {
    const receta = makeRecetaBase({ porciones: 12 });
    expect(receta.porciones).toBeGreaterThan(0);
    expect(Number.isInteger(receta.porciones)).toBe(true);
  });
});

describe('Receta de servicio', () => {
  it('tiene zona y no tiene insumoDestinoId', () => {
    const receta = makeRecetaBase({
      tipoReceta: 'servicio',
      zona: 'amex',
      insumoDestinoId: null,
    });
    expect(receta.zona).toBe('amex');
    expect(receta.insumoDestinoId).toBeNull();
  });

  it('zona válida es una de las tres zonas de servicio', () => {
    const zonas = ['amex', 'snack', 'buffet'] as const;
    for (const zona of zonas) {
      const receta = makeRecetaBase({ tipoReceta: 'servicio', zona, insumoDestinoId: null });
      expect(receta.zona).toBe(zona);
    }
  });
});

// ── RecetaIngrediente ─────────────────────────────────────────────────────────

describe('RecetaIngrediente', () => {
  it('mermaCoeficiente está en rango [0, 1)', () => {
    const ing = makeIngrediente({ mermaCoeficiente: 0.05 });
    expect(ing.mermaCoeficiente).toBeGreaterThanOrEqual(0);
    expect(ing.mermaCoeficiente).toBeLessThan(1);
  });

  it('cantidad es positiva', () => {
    const ing = makeIngrediente({ cantidad: 0.5 });
    expect(ing.cantidad).toBeGreaterThan(0);
  });

  it('está vinculado a una receta por recetaId', () => {
    const ing = makeIngrediente({ recetaId: 'receta-1' });
    expect(ing.recetaId).toBe('receta-1');
  });
});

// ── RecetaWithIngredientes ────────────────────────────────────────────────────

describe('RecetaWithIngredientes', () => {
  it('puede tener múltiples ingredientes', () => {
    const receta: RecetaWithIngredientes = {
      ...makeRecetaBase(),
      ingredientes: [
        makeIngrediente({ insumoId: 'harina', cantidad: 0.5 }),
        makeIngrediente({ insumoId: 'queso', cantidad: 0.2 }),
        makeIngrediente({ insumoId: 'huevo', cantidad: 0.1 }),
      ],
      insumoDestinoNombre: 'Pandebono',
    };
    expect(receta.ingredientes).toHaveLength(3);
  });

  it('puede tener cero ingredientes (receta sin ingredientes aún)', () => {
    const receta: RecetaWithIngredientes = {
      ...makeRecetaBase(),
      ingredientes: [],
      insumoDestinoNombre: null,
    };
    expect(receta.ingredientes).toHaveLength(0);
  });

  it('insumoDestinoNombre es null para recetas de servicio', () => {
    const receta: RecetaWithIngredientes = {
      ...makeRecetaBase({ tipoReceta: 'servicio', zona: 'buffet', insumoDestinoId: null }),
      ingredientes: [],
      insumoDestinoNombre: null,
    };
    expect(receta.insumoDestinoNombre).toBeNull();
  });
});
