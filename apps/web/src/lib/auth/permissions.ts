import type { UserRole } from '@dorado/shared-types';

// Fuente de verdad de la matriz de permisos.
// Importado por assertCan.ts (server) y por la UI de RBAC (client-safe).
// superuser tiene bypass total — no aparece en estas listas (ver assertCan.ts).
export const PERMISSIONS: Record<string, UserRole[]> = {
  // Inventario
  'inventory:read': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ],
  'inventory:write': ['admin', 'chef', 'sous_chef', 'personal_almacen'],
  'inventory:stock_out': ['admin', 'chef', 'sous_chef'],
  'inventory:merma': ['admin', 'chef', 'sous_chef', 'personal_almacen'],
  // Recetas
  'recipes:read': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
  ],
  'recipes:write': ['admin'],
  // Producción
  'production:read': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
    'steward',
  ],
  'production:write': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
    'steward',
  ],
  // Pedidos
  'orders:read': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
  ],
  'orders:create': ['admin', 'mesero_amex'],
  'orders:receive': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
  ],
  'orders:dispatch': ['admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente', 'sous_chef'],
  'orders:deliver': ['admin', 'mesero_amex'],
  'orders:trace': ['admin'], // panel de trazabilidad — solo admin
  'orders:cancel': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
  ],
  // Analytics
  'analytics:read': ['admin'],
  // Turnos
  'turnos:read': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
    'personal_almacen',
    'steward',
  ],
  'turnos:write': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_pasteleria',
    'personal_almacen',
    'steward',
  ],
  // Usuarios y tenants
  'users:read': ['admin'],
  'users:write': ['admin'],
  'tenants:read': [], // solo superuser — manejado por el bypass en assertCan
  'tenants:write': [], // solo superuser — manejado por el bypass en assertCan
  // Chat inter-zona
  'chat:read': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ],
  'chat:write': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'mesero_amex',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ],
  // Feature flags
  'feature_flags:read': ['admin'],
  'feature_flags:write': [], // solo superuser — manejado por el bypass
  // Cocina AMEX — KDS exclusivo del sous_chef
  'cocina_amex:read': ['admin', 'sous_chef'],
  'cocina_amex:write': ['admin', 'sous_chef'],
  // Cocina Fría — KDS exclusivo
  'cocina_fria:read': ['admin', 'chef_cocina_fria'],
  'cocina_fria:write': ['admin', 'chef_cocina_fria'],
  // Cocina Caliente — KDS exclusivo
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
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_almacen',
  ],
  'alertas:write': ['admin'],
};
