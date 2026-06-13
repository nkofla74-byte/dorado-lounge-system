import { describe, it, expect } from 'vitest';
import { zonaPermitidaParaRol } from './permissions';

describe('zonaPermitidaParaRol', () => {
  it('personal_snack solo puede operar la zona snack', () => {
    expect(zonaPermitidaParaRol('personal_snack', 'snack')).toBe(true);
    expect(zonaPermitidaParaRol('personal_snack', 'buffet')).toBe(false);
    expect(zonaPermitidaParaRol('personal_snack', 'amex')).toBe(false);
  });

  it('personal_buffet solo puede operar la zona buffet', () => {
    expect(zonaPermitidaParaRol('personal_buffet', 'buffet')).toBe(true);
    expect(zonaPermitidaParaRol('personal_buffet', 'snack')).toBe(false);
    expect(zonaPermitidaParaRol('personal_buffet', 'amex')).toBe(false);
  });

  it('roles sin zona fija operan cualquier zona', () => {
    for (const zona of ['amex', 'snack', 'buffet']) {
      expect(zonaPermitidaParaRol('admin', zona)).toBe(true);
      expect(zonaPermitidaParaRol('superuser', zona)).toBe(true);
      expect(zonaPermitidaParaRol('mesero_amex', zona)).toBe(true);
      expect(zonaPermitidaParaRol('chef_cocina_caliente', zona)).toBe(true);
    }
  });
});
