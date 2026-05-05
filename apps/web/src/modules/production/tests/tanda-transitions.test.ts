import { describe, it, expect } from 'vitest';
import { TANDA_TRANSITIONS } from '../domain/tanda';
import type { EstadoTanda } from '../domain/tanda';

const TODOS_LOS_ESTADOS: EstadoTanda[] = ['planificada', 'en_proceso', 'completada', 'cancelada'];

describe('TANDA_TRANSITIONS — máquina de estados de producción', () => {
  it('todos los estados tienen entrada en la matriz', () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(TANDA_TRANSITIONS).toHaveProperty(estado);
    }
  });

  it('flujo feliz: planificada → en_proceso → completada', () => {
    expect(TANDA_TRANSITIONS['planificada']).toContain('en_proceso');
    expect(TANDA_TRANSITIONS['en_proceso']).toContain('completada');
  });

  it('cancelación es posible desde planificada y en_proceso', () => {
    expect(TANDA_TRANSITIONS['planificada']).toContain('cancelada');
    expect(TANDA_TRANSITIONS['en_proceso']).toContain('cancelada');
  });

  it('estados terminales no tienen transiciones salientes', () => {
    expect(TANDA_TRANSITIONS['completada']).toHaveLength(0);
    expect(TANDA_TRANSITIONS['cancelada']).toHaveLength(0);
  });

  it('no se puede saltar directamente de planificada a completada', () => {
    expect(TANDA_TRANSITIONS['planificada']).not.toContain('completada');
  });

  it('no se puede reabrir una tanda completada', () => {
    expect(TANDA_TRANSITIONS['completada']).not.toContain('planificada');
    expect(TANDA_TRANSITIONS['completada']).not.toContain('en_proceso');
  });

  it('no se puede reabrir una tanda cancelada', () => {
    expect(TANDA_TRANSITIONS['cancelada']).not.toContain('planificada');
    expect(TANDA_TRANSITIONS['cancelada']).not.toContain('en_proceso');
  });

  it('no hay auto-transiciones en ningún estado', () => {
    for (const estado of TODOS_LOS_ESTADOS) {
      expect(TANDA_TRANSITIONS[estado]).not.toContain(estado);
    }
  });

  it('helper isValidTransition funciona correctamente', () => {
    const isValid = (from: EstadoTanda, to: EstadoTanda) => TANDA_TRANSITIONS[from].includes(to);

    expect(isValid('planificada', 'en_proceso')).toBe(true);
    expect(isValid('planificada', 'completada')).toBe(false);
    expect(isValid('en_proceso', 'completada')).toBe(true);
    expect(isValid('completada', 'cancelada')).toBe(false);
    expect(isValid('cancelada', 'planificada')).toBe(false);
  });
});
