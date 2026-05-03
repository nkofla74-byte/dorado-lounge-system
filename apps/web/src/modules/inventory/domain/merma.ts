// Función pura — sin dependencias externas. 90%+ coverage obligatoria (CLAUDE.md).
// Calcula la cantidad real a descontar de inventario aplicando el coeficiente de merma.
//
// Fórmula: cantidad_a_descontar = cantidad_requerida / (1 - coeficiente)
//
// Ejemplo: preparar 100g de pollo con 10% de merma requiere descontar 111.1111g
// porque 11.1111g se pierden en el proceso de cocción/corte.

export class MermaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MermaError';
  }
}

/**
 * Calcula la cantidad bruta a descontar del inventario para obtener
 * la cantidad neta requerida después de aplicar la merma.
 *
 * @param cantidadRequerida - Cantidad neta que se necesita (> 0)
 * @param coeficiente       - Coeficiente de merma [0, 1) — 0 = sin merma, 0.5 = 50% de pérdida
 * @returns Cantidad bruta a descontar, redondeada a 4 decimales
 * @throws MermaError si los parámetros están fuera del rango válido
 */
export function cantidadConMerma(cantidadRequerida: number, coeficiente: number): number {
  if (cantidadRequerida < 0) {
    throw new MermaError(`cantidadRequerida debe ser >= 0, recibido: ${cantidadRequerida}`);
  }

  if (coeficiente < 0 || coeficiente >= 1) {
    throw new MermaError(`coeficiente debe estar en [0, 1), recibido: ${coeficiente}`);
  }

  if (cantidadRequerida === 0) return 0;

  const bruto = cantidadRequerida / (1 - coeficiente);
  return Math.round(bruto * 10_000) / 10_000;
}

/**
 * Calcula la merma absoluta (cantidad que se pierde) dado un coeficiente.
 * Útil para registrar mermas categorizadas.
 */
export function mermaAbsoluta(cantidadRequerida: number, coeficiente: number): number {
  return (
    Math.round((cantidadConMerma(cantidadRequerida, coeficiente) - cantidadRequerida) * 10_000) /
    10_000
  );
}
