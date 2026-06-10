// Función pura — sin dependencias externas. 90%+ coverage obligatoria (CLAUDE.md).
//
// MODELO DE MERMA (refoco operacional F3, 2026-05-30):
// La merma se aplica UNA VEZ, en la RECEPCIÓN del insumo. El inventario guarda
// el peso NETO usable y el consumo de recetas descuenta ese neto directamente.
//   neto = comprado × (1 - coeficiente)            ← `aplicarMermaRecepcion`
// El coeficiente es propiedad del insumo (`insumos.merma_default`).
//
// Las funciones `cantidadConMerma` / `mermaAbsoluta` (merma en el consumo:
// bruto = requerida/(1-coef)) se conservan como utilidades puras para
// simulaciones/what-if, pero YA NO se usan en el descuento ni en el costo.

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

/**
 * Aplica la merma en la RECEPCIÓN: convierte la cantidad comprada (bruta) al
 * peso NETO usable que se almacena en inventario.
 *
 * Fórmula: neto = comprado × (1 - coeficiente)
 * Ejemplo: 10 kg comprados con 15% de merma → 8.5 kg netos.
 *
 * @param comprado    - Cantidad comprada/recibida (>= 0)
 * @param coeficiente - Coeficiente de merma del insumo [0, 1)
 * @returns Cantidad neta a almacenar, redondeada a 4 decimales
 * @throws MermaError si los parámetros están fuera de rango
 */
export function aplicarMermaRecepcion(comprado: number, coeficiente: number): number {
  if (comprado < 0) {
    throw new MermaError(`comprado debe ser >= 0, recibido: ${comprado}`);
  }
  if (coeficiente < 0 || coeficiente >= 1) {
    throw new MermaError(`coeficiente debe estar en [0, 1), recibido: ${coeficiente}`);
  }
  if (comprado === 0) return 0;

  const neto = comprado * (1 - coeficiente);
  return Math.round(neto * 10_000) / 10_000;
}

/**
 * Convierte el costo unitario bruto (por unidad comprada) al costo unitario
 * NETO (por unidad usable). Preserva el valor total del lote: el costo total
 * pagado se reparte sobre la cantidad neta.
 *
 * Fórmula: costo_neto = costo_bruto / (1 - coeficiente)
 *
 * @param costoBruto  - Costo por unidad comprada (>= 0)
 * @param coeficiente - Coeficiente de merma del insumo [0, 1)
 * @returns Costo por unidad neta, redondeado a 4 decimales
 * @throws MermaError si los parámetros están fuera de rango
 */
export function costoUnitarioNeto(costoBruto: number, coeficiente: number): number {
  if (costoBruto < 0) {
    throw new MermaError(`costoBruto debe ser >= 0, recibido: ${costoBruto}`);
  }
  if (coeficiente < 0 || coeficiente >= 1) {
    throw new MermaError(`coeficiente debe estar en [0, 1), recibido: ${coeficiente}`);
  }
  if (costoBruto === 0) return 0;

  const neto = costoBruto / (1 - coeficiente);
  return Math.round(neto * 10_000) / 10_000;
}
