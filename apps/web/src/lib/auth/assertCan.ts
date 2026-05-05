'use server';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { UserRole } from '@dorado/shared-types';

// Matriz de permisos: permission → roles autorizados.
// superuser tiene bypass total (God Mode — ver CLAUDE.md §Roles).
// Si un permiso no existe en este mapa, es un error de programación (500).
const PERMISSIONS: Record<string, UserRole[]> = {
  // Inventario
  'inventory:read': ['admin', 'chef', 'sous_chef', 'personal_snack', 'personal_buffet'],
  'inventory:write': ['admin', 'chef', 'sous_chef'],
  'inventory:stock_out': ['admin', 'chef', 'sous_chef', 'personal_snack', 'personal_buffet'],
  'inventory:merma': ['admin', 'chef', 'sous_chef', 'personal_snack', 'personal_buffet'],
  // Recetas
  'recipes:read': ['admin', 'chef', 'sous_chef'],
  'recipes:write': ['admin'],
  // Producción
  'production:read': ['admin', 'chef', 'sous_chef'],
  'production:write': ['admin', 'chef', 'sous_chef'],
  // Pedidos
  'orders:read': ['admin', 'chef', 'sous_chef', 'mesero_amex'],
  'orders:create': ['admin', 'mesero_amex'],
  'orders:dispatch': ['admin', 'chef', 'sous_chef'],
  'orders:deliver': ['admin', 'mesero_amex'],
  'orders:cancel': ['admin', 'chef', 'sous_chef', 'mesero_amex'],
  // Buffet
  'buffet:read': ['admin', 'chef', 'sous_chef', 'personal_buffet'],
  'buffet:write': ['admin', 'personal_buffet'],
  // Snack
  'snack:read': ['admin', 'chef', 'sous_chef', 'personal_snack'],
  'snack:write': ['admin', 'personal_snack'],
  // Analytics
  'analytics:read': ['admin'],
  // Afluencia
  'afluencia:read': ['admin', 'chef', 'sous_chef'],
  'afluencia:write': ['admin', 'chef', 'sous_chef'],
  // Turnos
  'turnos:read': ['admin', 'chef', 'sous_chef'],
  'turnos:write': ['admin'],
  // Usuarios y tenants
  'users:write': ['admin'],
  'tenants:write': [], // solo superuser — manejado por el bypass
  // Auditoría
  'audit:read': ['admin'],
};

export interface SessionContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

export async function assertCan(permission: string): Promise<SessionContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError('UNAUTHENTICATED', 401, 'No autenticado');
  }

  const role = user.app_metadata?.role as UserRole | undefined;
  const tenantId = user.app_metadata?.tenant_id as string | undefined;

  if (!role || !tenantId) {
    throw new AppError('INVALID_SESSION', 401, 'Sesión inválida: sin rol o tenant en JWT');
  }

  // superuser: God Mode — bypass total de la matriz de permisos.
  // Sigue necesitando tenantId para las operaciones de scope.
  if (role === 'superuser') {
    return { userId: user.id, tenantId, role };
  }

  const allowed = PERMISSIONS[permission];
  if (allowed === undefined) {
    throw new AppError('UNKNOWN_PERMISSION', 500, `Permiso desconocido: ${permission}`);
  }

  if (!allowed.includes(role)) {
    throw new AppError('FORBIDDEN', 403, `Rol '${role}' no tiene permiso '${permission}'`, {
      role,
      permission,
    });
  }

  return { userId: user.id, tenantId, role };
}
