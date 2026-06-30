import type { UserRole } from '@dorado/shared-types';

// Fuente de verdad de la matriz de permisos.
// Importado por assertCan.ts (server) y por la UI de RBAC (client-safe).
// superuser tiene bypass total — no aparece en estas listas (ver assertCan.ts).
export const PERMISSIONS: Record<string, UserRole[]> = {
  // Inventario
  'inventory:read': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ],
  'inventory:write': ['admin', 'sous_chef', 'personal_almacen'],
  'inventory:stock_out': ['admin', 'sous_chef'],
  'inventory:merma': ['admin', 'sous_chef', 'personal_almacen'],
  // Recetas
  'recipes:read': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
    'personal_snack',
    'personal_buffet',
  ],
  'recipes:write': ['admin'],
  // Producción
  'production:read': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
    'personal_snack',
    'personal_buffet',
    'steward',
  ],
  'production:write': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
    'steward',
  ],
  // Pedidos
  'orders:read': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
    'personal_snack',
    'personal_buffet',
  ],
  'orders:create': ['admin', 'mesero_amex', 'personal_snack', 'personal_buffet'],
  'orders:receive': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
  ],
  'orders:dispatch': ['admin', 'chef_cocina_fria', 'chef_cocina_caliente', 'sous_chef'],
  'orders:deliver': ['admin', 'mesero_amex', 'personal_snack', 'personal_buffet'],
  'orders:trace': ['admin'], // panel de trazabilidad — solo admin
  'orders:cancel': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_snack',
    'personal_buffet',
  ],
  // Analytics
  'analytics:read': ['admin'],
  // Turnos
  'turnos:read': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
    'personal_snack',
    'personal_buffet',
    'personal_almacen',
    'steward',
  ],
  'turnos:write': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
    'personal_snack',
    'personal_buffet',
    'personal_almacen',
    'steward',
  ],
  // Usuarios y tenants
  'users:read': ['admin'],
  'users:write': ['admin'],
  'tenants:read': [], // solo superuser — manejado por el bypass en assertCan
  'tenants:write': [], // solo superuser — manejado por el bypass en assertCan
  // Cocina AMEX — KDS exclusivo del sous_chef
  'cocina_amex:read': ['admin', 'sous_chef'],
  'cocina_amex:write': ['admin', 'sous_chef'],
  // Cocina Fría — KDS de área
  'cocina_fria:read': ['admin', 'chef_cocina_fria'],
  'cocina_fria:write': ['admin', 'chef_cocina_fria'],
  // Cocina Caliente — KDS de área
  'cocina_caliente:read': ['admin', 'chef_cocina_caliente'],
  'cocina_caliente:write': ['admin', 'chef_cocina_caliente'],
  // Pastelería — KDS de pedidos (postres ruteados al área)
  'pasteleria:read': ['admin', 'personal_pasteleria'],
  'pasteleria:write': ['admin', 'personal_pasteleria'],
  // Proveedores — gestión de proveedores e historial compras
  'proveedores:read': ['admin', 'personal_almacen'],
  'proveedores:write': ['admin', 'personal_almacen'],
  // Alertas — motor de alertas in-app
  'alertas:read': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_almacen',
  ],
  'alertas:write': ['admin'],
  // Requisiciones cocina → almacén (Frente 2)
  'requisiciones:read': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
    'personal_almacen',
  ],
  'requisiciones:create': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
  ],
  'requisiciones:despachar': ['admin', 'personal_almacen'],
  'requisiciones:confirmar': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
  ],
  'requisiciones:cancel': [
    'admin',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
  ],
};

// Roles atados a una zona de origen — solo pueden operar pedidos de su zona.
// Los demás roles (admin, mesero, chefs) no tienen zona fija.
const ROLE_ZONA: Partial<Record<UserRole, string>> = {
  personal_snack: 'snack',
  personal_buffet: 'buffet',
};

export function zonaPermitidaParaRol(role: UserRole, zona: string): boolean {
  const zonaFija = ROLE_ZONA[role];
  return zonaFija === undefined || zonaFija === zona;
}

// Mapea cada rol de cocina a su área productiva. Roles sin entrada (admin)
// no están atados — pueden operar requisiciones de cualquier área. Los turnos
// rotan, por eso confirmar valida el ÁREA, no la identidad del solicitante.
const ROLE_AREA: Partial<Record<UserRole, string>> = {
  chef_cocina_caliente: 'cocina_caliente',
  chef_cocina_fria: 'cocina_fria',
  sous_chef: 'amex',
  personal_pasteleria: 'pasteleria',
};

export function areaPermitidaParaRol(role: UserRole, area: string): boolean {
  const areaFija = ROLE_AREA[role];
  return areaFija === undefined || areaFija === area;
}
