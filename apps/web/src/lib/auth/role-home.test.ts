import { describe, it, expect } from 'vitest';
import { ROLE_HOME, ROLE_ALLOWED_PREFIXES, canAccess, getRoleHome, getSafeNext } from './role-home';
import type { UserRole } from '@dorado/shared-types';

const ROLES = Object.keys(ROLE_HOME) as UserRole[];

describe('ROLE_HOME / ROLE_ALLOWED_PREFIXES invariant', () => {
  it('todo rol tiene una entrada en ROLE_ALLOWED_PREFIXES', () => {
    for (const role of ROLES) {
      expect(ROLE_ALLOWED_PREFIXES[role], `rol ${role} sin prefijos permitidos`).toBeDefined();
    }
  });

  it('ROLE_HOME[rol] siempre es accesible según ROLE_ALLOWED_PREFIXES[rol]', () => {
    for (const role of ROLES) {
      const home = ROLE_HOME[role];
      expect(
        canAccess(role, home),
        `rol "${role}": home "${home}" no está en su whitelist [${ROLE_ALLOWED_PREFIXES[role].join(', ')}]`,
      ).toBe(true);
    }
  });
});

describe('canAccess', () => {
  it('superuser accede a cualquier ruta', () => {
    expect(canAccess('superuser', '/admin/tenants')).toBe(true);
    expect(canAccess('superuser', '/inventario')).toBe(true);
    expect(canAccess('superuser', '/cocina-amex')).toBe(true);
  });

  it('mesero_amex solo accede a /pedidos', () => {
    expect(canAccess('mesero_amex', '/pedidos')).toBe(true);
    expect(canAccess('mesero_amex', '/pedidos/123')).toBe(true);
    expect(canAccess('mesero_amex', '/inventario')).toBe(false);
    expect(canAccess('mesero_amex', '/cocina')).toBe(false);
  });

  it('personal_almacen puede acceder a /admin/proveedores', () => {
    expect(canAccess('personal_almacen', '/almacen')).toBe(true);
    expect(canAccess('personal_almacen', '/admin/proveedores')).toBe(true);
    expect(canAccess('personal_almacen', '/admin/tenants')).toBe(false);
  });

  it('no confunde prefijos parciales (/co no da acceso a /cocina)', () => {
    expect(canAccess('chef', '/cocinaX')).toBe(false);
    expect(canAccess('mesero_amex', '/pedidosX')).toBe(false);
  });
});

describe('getRoleHome', () => {
  it('devuelve la ruta correcta para cada rol', () => {
    expect(getRoleHome('mesero_amex')).toBe('/pedidos');
    expect(getRoleHome('admin')).toBe('/inventario');
    expect(getRoleHome('chef')).toBe('/cocina');
    expect(getRoleHome('sous_chef')).toBe('/cocina-amex');
  });

  it('devuelve /inventario para rol desconocido o undefined', () => {
    expect(getRoleHome(undefined)).toBe('/inventario');
    expect(getRoleHome('rol_inexistente')).toBe('/inventario');
  });
});

describe('getSafeNext', () => {
  it('acepta rutas internas válidas', () => {
    expect(getSafeNext('/pedidos', 'mesero_amex')).toBe('/pedidos');
    expect(getSafeNext('/inventario/lotes', 'admin')).toBe('/inventario/lotes');
  });

  it('rechaza rutas externas y devuelve el home del rol', () => {
    expect(getSafeNext('https://evil.com', 'mesero_amex')).toBe('/pedidos');
    expect(getSafeNext('//evil.com', 'admin')).toBe('/inventario');
  });

  it('rechaza /login para evitar redirect loops', () => {
    expect(getSafeNext('/login', 'mesero_amex')).toBe('/pedidos');
  });

  it('acepta null/undefined devolviendo el home del rol', () => {
    expect(getSafeNext(null, 'chef')).toBe('/cocina');
    expect(getSafeNext(undefined, 'chef')).toBe('/cocina');
  });
});

describe('roles de zona snack/buffet', () => {
  it('personal_snack aterriza en /snack y solo accede a /snack', () => {
    expect(ROLE_HOME.personal_snack).toBe('/snack');
    expect(canAccess('personal_snack', '/snack')).toBe(true);
    expect(canAccess('personal_snack', '/buffet')).toBe(false);
    expect(canAccess('personal_snack', '/pedidos')).toBe(false);
    expect(canAccess('personal_snack', '/inventario')).toBe(false);
  });

  it('personal_buffet aterriza en /buffet y solo accede a /buffet', () => {
    expect(ROLE_HOME.personal_buffet).toBe('/buffet');
    expect(canAccess('personal_buffet', '/buffet')).toBe(true);
    expect(canAccess('personal_buffet', '/snack')).toBe(false);
  });

  it('admin puede auditar /snack y /buffet', () => {
    expect(canAccess('admin', '/snack')).toBe(true);
    expect(canAccess('admin', '/buffet')).toBe(true);
  });
});
