// Proyección de "lotes próximos a vencer" — lógica pura, sin Supabase.
// El cálculo de días restantes y la extracción del nombre del insumo viven
// aquí para ser testeables sin mockear el cliente de DB.

export interface LoteProximoVencer {
  loteId: string;
  insumoNombre: string;
  fechaVencimiento: string;
  diasRestantes: number;
  cantidadActual: number;
}

/**
 * Forma cruda de la fila que devuelve PostgREST para
 * `lotes.select('id, cantidad_actual, fecha_vencimiento, insumos(nombre)')`.
 *
 * `lotes.insumo_id` es una FK *to-one* → PostgREST embebe el insumo como un
 * **objeto** (no un array). Tipar/acceder esto como array hace que el nombre
 * salga siempre vacío (bug M-15). Se acepta también la forma array de manera
 * defensiva por si una relación se infiere como to-many en algún entorno.
 */
export interface LoteVencimientoRow {
  id: string;
  cantidad_actual: number | string;
  fecha_vencimiento: string;
  insumos: { nombre: string } | { nombre: string }[] | null;
}

function extraerNombreInsumo(insumos: LoteVencimientoRow['insumos']): string {
  if (!insumos) return '—';
  const insumo = Array.isArray(insumos) ? insumos[0] : insumos;
  return insumo?.nombre ?? '—';
}

/** Días naturales entre `hoy` (a medianoche) y la fecha de vencimiento del lote. */
function diasRestantes(fechaVencimiento: string, hoy: Date): number {
  const fv = new Date(fechaVencimiento);
  return Math.round((fv.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export function mapLoteProximoVencer(row: LoteVencimientoRow, hoy: Date): LoteProximoVencer {
  return {
    loteId: row.id,
    insumoNombre: extraerNombreInsumo(row.insumos),
    fechaVencimiento: row.fecha_vencimiento,
    diasRestantes: diasRestantes(row.fecha_vencimiento, hoy),
    cantidadActual: Number(row.cantidad_actual),
  };
}
