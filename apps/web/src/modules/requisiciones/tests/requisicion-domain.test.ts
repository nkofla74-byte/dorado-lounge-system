import { describe, it, expect } from 'vitest';
import { REQUISICION_TRANSITIONS, puedeTransicionar } from '../domain/requisicion';

describe('requisicion domain', () => {
  it('puedeTransicionar respeta la máquina de estados', () => {
    expect(puedeTransicionar('solicitada', 'en_alistamiento')).toBe(true);
    expect(puedeTransicionar('solicitada', 'despachada')).toBe(false);
    expect(puedeTransicionar('en_alistamiento', 'despachada')).toBe(true);
    expect(puedeTransicionar('despachada', 'recibida')).toBe(true);
    expect(puedeTransicionar('recibida', 'cancelada')).toBe(false);
  });

  it('re-exporta el contrato de transiciones de shared-types', () => {
    expect(REQUISICION_TRANSITIONS.solicitada).toContain('cancelada');
  });
});
