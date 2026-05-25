import type { UserRole } from '@dorado/shared-types';

// Fuente de verdad de la matriz de permisos.
// Importado por assertCan.ts (server) y por la UI de RBAC (client-safe).
// superuser tiene bypass total — no aparece en estas listas (ver assertCan.ts).
export const PERMISSIONS: Record<string, UserRole[]> = {
  // Inventario
  'inventory:read': [
    'admin',
    'chef',
    'sous_chef',
    'personal_snack',
    'personal_buffet',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ],
  'inventory:write': ['admin', 'chef', 'sous_chef', 'personal_almacen'],
  'inventory:stock_out': ['admin', 'chef', 'sous_chef', 'personal_snack', 'personal_buffet'],
  'inventory:merma': [
    'admin',
    'chef',
    'sous_chef',
    'personal_snack',
    'personal_buffet',
    'personal_almacen',
  ],
  // Recetas
  'recipes:read': ['admin', 'chef', 'sous_chef', 'personal_pasteleria'],
  'recipes:write': ['admin'],
  // Producción
  'production:read': ['admin', 'chef', 'sous_chef', 'personal_pasteleria', 'steward'],
  'production:write': ['admin', 'chef', 'sous_chef', 'personal_pasteleria', 'steward'],
  // Pedidos
  'orders:read': ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion', 'personal_pasteleria'],
  'orders:create': ['admin', 'mesero_amex', 'recepcion'],
  // Recibir el pedido en cocina: el mesero/recepción lo marca cuando lleva la
  // orden física a la cocina (entre 'creado' y 'en_preparacion').
  'orders:receive': ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion'],
  'orders:dispatch': ['admin', 'chef', 'sous_chef'],
  'orders:deliver': ['admin', 'mesero_amex', 'recepcion'],
  'orders:cancel': ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion'],
  // Buffet
  'buffet:read': ['admin', 'chef', 'sous_chef', 'personal_buffet'],
  'buffet:write': ['admin', 'personal_buffet'],
  // Snack
  'snack:read': ['admin', 'chef', 'sous_chef', 'personal_snack'],
  'snack:write': ['admin', 'personal_snack'],
  // Analytics
  'analytics:read': ['admin'],
  // Afluencia
  'afluencia:read': ['admin', 'chef', 'sous_chef', 'recepcion'],
  'afluencia:write': ['admin', 'chef', 'sous_chef', 'recepcion'],
  // Turnos
  'turnos:read': ['admin', 'chef', 'sous_chef'],
  'turnos:write': ['admin'],
  // Usuarios y tenants
  'users:read': ['admin'],
  'users:write': ['admin'],
  'tenants:read': [], // solo superuser — manejado por el bypass en assertCan
  'tenants:write': [], // solo superuser — manejado por el bypass en assertCan
  // Chat inter-zona
  'chat:read': [
    'admin',
    'chef',
    'sous_chef',
    'mesero_amex',
    'recepcion',
    'personal_snack',
    'personal_buffet',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ],
  'chat:write': [
    'admin',
    'chef',
    'sous_chef',
    'mesero_amex',
    'recepcion',
    'personal_snack',
    'personal_buffet',
    'personal_almacen',
    'personal_pasteleria',
    'steward',
  ],
  // Auditoría
  'audit:read': ['admin'],
  // Feature flags
  'feature_flags:read': ['admin'],
  'feature_flags:write': [], // solo superuser — manejado por el bypass
  // Vuelos El Dorado (Sprint 6)
  'flights:read': ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion'],
  // Estadísticas de vuelos — solo gerencia operativa
  'flights:stats:read': ['admin', 'recepcion'],
  // Cocina AMEX — KDS exclusivo del sous_chef
  'cocina_amex:read': ['admin', 'sous_chef'],
  'cocina_amex:write': ['admin', 'sous_chef'],
  // Proveedores — gestión de proveedores e historial compras
  'proveedores:read': ['admin', 'personal_almacen'],
  'proveedores:write': ['admin', 'personal_almacen'],
  // Alertas — motor de alertas in-app
  'alertas:read': ['admin', 'chef', 'sous_chef', 'personal_almacen'],
  'alertas:write': ['admin'],
};
