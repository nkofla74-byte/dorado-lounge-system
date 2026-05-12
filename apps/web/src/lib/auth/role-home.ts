export const ROLE_HOME: Record<string, string> = {
  superuser: '/admin/tenants',
  admin: '/inventario',
  chef: '/cocina',
  sous_chef: '/cocina',
  mesero_amex: '/pedidos',
  personal_snack: '/snack',
  personal_buffet: '/buffet',
  recepcion: '/pedidos',
  personal_almacen: '/almacen',
  personal_pasteleria: '/pasteleria',
  steward: '/produccion',
};

export function getRoleHome(role: string | undefined): string {
  return ROLE_HOME[role ?? ''] ?? '/inventario';
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
