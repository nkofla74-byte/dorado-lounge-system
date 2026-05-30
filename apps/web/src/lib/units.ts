import type { UnidadMedida } from '@dorado/shared-types';

// Factores hacia la unidad canónica de cada familia.
// Tras el refoco operacional (F2) las unidades válidas son {g, ml, unidad},
// por lo que cada familia tiene un único miembro canónico. La maquinaria de
// conversión se conserva por si alguna familia vuelve a tener variantes.
const WEIGHT_TO_G: Partial<Record<UnidadMedida, number>> = {
  g: 1,
};

const VOLUME_TO_ML: Partial<Record<UnidadMedida, number>> = {
  ml: 1,
};

export type FamiliaUnidad = 'peso' | 'volumen' | 'discreta';

export function familiaUnidad(u: UnidadMedida): FamiliaUnidad {
  if (u in WEIGHT_TO_G) return 'peso';
  if (u in VOLUME_TO_ML) return 'volumen';
  return 'discreta';
}

export function sonCompatibles(a: UnidadMedida, b: UnidadMedida): boolean {
  if (a === b) return true;
  return familiaUnidad(a) === familiaUnidad(b) && familiaUnidad(a) !== 'discreta';
}

export function unidadesCompatibles(base: UnidadMedida): UnidadMedida[] {
  const fam = familiaUnidad(base);
  if (fam === 'peso') return Object.keys(WEIGHT_TO_G) as UnidadMedida[];
  if (fam === 'volumen') return Object.keys(VOLUME_TO_ML) as UnidadMedida[];
  return [base];
}

export class UnitConversionError extends Error {
  constructor(from: UnidadMedida, to: UnidadMedida) {
    super(`Unidades incompatibles: no se puede convertir ${from} → ${to}`);
    this.name = 'UnitConversionError';
  }
}

export function convertirCantidad(cantidad: number, from: UnidadMedida, to: UnidadMedida): number {
  if (from === to) return cantidad;
  const famFrom = familiaUnidad(from);
  const famTo = familiaUnidad(to);
  if (famFrom !== famTo || famFrom === 'discreta') {
    throw new UnitConversionError(from, to);
  }
  const table = famFrom === 'peso' ? WEIGHT_TO_G : VOLUME_TO_ML;
  const factorFrom = table[from]!;
  const factorTo = table[to]!;
  return (cantidad * factorFrom) / factorTo;
}
