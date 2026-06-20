import { describe, it, expect } from 'vitest';
import { PERMISSIONS, areaPermitidaParaRol } from './permissions';

describe('permisos de requisiciones', () => {
  it('despachar es exclusivo de almacén + admin', () => {
    expect(PERMISSIONS['requisiciones:despachar']).toEqual(['admin', 'personal_almacen']);
  });

  it('crear lo pueden los roles de cocina, no almacén', () => {
    expect(PERMISSIONS['requisiciones:create']).toContain('chef_cocina_caliente');
    expect(PERMISSIONS['requisiciones:create']).not.toContain('personal_almacen');
  });
});

describe('areaPermitidaParaRol', () => {
  it('un chef de caliente solo confirma requisiciones de cocina_caliente', () => {
    expect(areaPermitidaParaRol('chef_cocina_caliente', 'cocina_caliente')).toBe(true);
    expect(areaPermitidaParaRol('chef_cocina_caliente', 'cocina_fria')).toBe(false);
  });

  it('sous_chef cubre el área amex', () => {
    expect(areaPermitidaParaRol('sous_chef', 'amex')).toBe(true);
    expect(areaPermitidaParaRol('sous_chef', 'pasteleria')).toBe(false);
  });

  it('admin no está atado a un área', () => {
    expect(areaPermitidaParaRol('admin', 'cocina_fria')).toBe(true);
    expect(areaPermitidaParaRol('admin', 'pasteleria')).toBe(true);
  });
});
