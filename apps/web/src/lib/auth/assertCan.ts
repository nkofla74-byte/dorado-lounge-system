'use server';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { UserRole } from '@dorado/shared-types';
import { PERMISSIONS } from './permissions';

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
