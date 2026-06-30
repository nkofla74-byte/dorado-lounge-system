import { describe, it, expect } from 'vitest';
import { mapLoteProximoVencer, type LoteVencimientoRow } from '../domain/lote-vencimiento';

const HOY = new Date('2026-06-30T00:00:00.000Z');

function row(overrides: Partial<LoteVencimientoRow> = {}): LoteVencimientoRow {
  return {
    id: 'lote-1',
    cantidad_actual: 12,
    fecha_vencimiento: '2026-07-05',
    insumos: { nombre: 'Salmón' },
    ...overrides,
  };
}

describe('mapLoteProximoVencer', () => {
  // Regresión M-15: insumos es una relación to-one → PostgREST devuelve un
  // OBJETO. Acceder como array dejaba el nombre siempre en '—'.
  it('extrae el nombre del insumo desde el embed to-one (objeto)', () => {
    const result = mapLoteProximoVencer(row({ insumos: { nombre: 'Salmón' } }), HOY);
    expect(result.insumoNombre).toBe('Salmón');
  });

  it('acepta defensivamente la forma array (to-many)', () => {
    const result = mapLoteProximoVencer(row({ insumos: [{ nombre: 'Caviar' }] }), HOY);
    expect(result.insumoNombre).toBe('Caviar');
  });

  it('usa el guion como fallback cuando no hay insumo', () => {
    expect(mapLoteProximoVencer(row({ insumos: null }), HOY).insumoNombre).toBe('—');
    expect(mapLoteProximoVencer(row({ insumos: [] }), HOY).insumoNombre).toBe('—');
  });

  it('calcula días restantes en días naturales', () => {
    const result = mapLoteProximoVencer(row({ fecha_vencimiento: '2026-07-05' }), HOY);
    expect(result.diasRestantes).toBe(5);
  });

  it('produce días negativos para lotes ya vencidos', () => {
    const result = mapLoteProximoVencer(row({ fecha_vencimiento: '2026-06-28' }), HOY);
    expect(result.diasRestantes).toBe(-2);
  });

  it('normaliza cantidad_actual numérico aunque venga como string', () => {
    expect(mapLoteProximoVencer(row({ cantidad_actual: '7.5' }), HOY).cantidadActual).toBe(7.5);
  });

  it('mapea los campos restantes 1:1', () => {
    const result = mapLoteProximoVencer(
      row({ id: 'lote-9', fecha_vencimiento: '2026-07-01' }),
      HOY,
    );
    expect(result.loteId).toBe('lote-9');
    expect(result.fechaVencimiento).toBe('2026-07-01');
  });
});
