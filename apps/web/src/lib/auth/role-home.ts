import type { UserRole } from '@dorado/shared-types';

export const ROLE_HOME: Record<UserRole, string> = {
  superuser: '/admin/tenants',
  admin: '/inventario',
  chef: '/cocina',
  sous_chef: '/cocina-amex',
  mesero_amex: '/pedidos',
  recepcion: '/afluencia',
  personal_snack: '/snack',
  personal_buffet: '/buffet',
  personal_almacen: '/almacen',
  personal_pasteleria: '/pasteleria',
  steward: '/produccion',
};

// Prefijos de ruta accesibles por rol (whitelist para el middleware).
// superuser tiene acceso total; el resto solo ve lo que necesita.
// assertCan() en cada Server Action sigue siendo la autoridad final sobre escritura.
export const ROLE_ALLOWED_PREFIXES: Record<UserRole, string[]> = {
  superuser: ['/'],
  admin: [
    '/inventario',
    '/almacen',
    '/recetas',
    '/produccion',
    '/pasteleria',
    '/pedidos',
    '/cocina',
    '/cocina-amex',
    '/buffet',
    '/snack',
    '/afluencia',
    '/analytics',
    '/admin',
    '/vuelos',
  ],
  chef: [
    '/cocina',
    '/produccion',
    '/pedidos',
    '/inventario',
    '/recetas',
    '/afluencia',
    '/snack',
    '/buffet',
    '/vuelos',
  ],
  sous_chef: [
    '/cocina-amex',
    '/produccion',
    '/pedidos',
    '/inventario',
    '/recetas',
    '/afluencia',
    '/vuelos',
  ],
  mesero_amex: ['/pedidos', '/vuelos'],
  recepcion: ['/afluencia', '/vuelos'],
  personal_snack: ['/snack', '/inventario'],
  personal_buffet: ['/buffet', '/inventario'],
  personal_almacen: ['/almacen', '/inventario', '/admin/proveedores'],
  personal_pasteleria: ['/pasteleria', '/produccion', '/recetas', '/inventario'],
  steward: ['/produccion', '/inventario'],
};

export function canAccess(role: UserRole, pathname: string): boolean {
  const prefixes = ROLE_ALLOWED_PREFIXES[role];
  if (!prefixes) return false;
  return prefixes.some(
    (prefix) =>
      prefix === '/' ||
      pathname === prefix ||
      pathname.startsWith(prefix + '/') ||
      pathname.startsWith(prefix + '?'),
  );
}

export function getRoleHome(role: string | undefined): string {
  return ROLE_HOME[(role as UserRole) ?? ''] ?? '/inventario';
}

// Previene open redirect: solo acepta rutas internas que no sean /login
export function getSafeNext(next: string | null | undefined, role: string | undefined): string {
  const isInternal =
    typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/login');
  return isInternal ? next : getRoleHome(role);
}
