import type { UserRole } from '@dorado/shared-types';

export const ROLE_HOME: Record<UserRole, string> = {
  superuser: '/admin/tenants',
  admin: '/inventario',
  chef_cocina_fria: '/cocina-fria',
  chef_cocina_caliente: '/cocina-caliente',
  sous_chef: '/cocina-amex',
  mesero_amex: '/pedidos',
  personal_almacen: '/almacen',
  personal_pasteleria: '/pasteleria',
  personal_snack: '/snack',
  personal_buffet: '/buffet',
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
    '/snack',
    '/buffet',
    '/cocina-fria',
    '/cocina-caliente',
    '/cocina-amex',
    '/analytics',
    '/admin',
  ],
  chef_cocina_fria: ['/cocina-fria', '/produccion', '/inventario', '/recetas'],
  chef_cocina_caliente: ['/cocina-caliente', '/produccion', '/inventario', '/recetas'],
  sous_chef: ['/cocina-amex', '/produccion', '/pedidos', '/inventario', '/recetas'],
  mesero_amex: ['/pedidos'],
  personal_almacen: ['/almacen', '/inventario', '/admin/proveedores'],
  personal_pasteleria: ['/pasteleria', '/produccion', '/recetas', '/inventario'],
  personal_snack: ['/snack'],
  personal_buffet: ['/buffet'],
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
