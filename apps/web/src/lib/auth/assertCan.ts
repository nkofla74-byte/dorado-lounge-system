'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/result';
import type { UserRole } from '@dorado/shared-types';
import { PERMISSIONS } from './permissions';

export interface SessionContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

/**
 * Comprueba que la sesión sigue siendo válida contra el estado actual del
 * usuario (F-003).
 *
 * La autorización se resolvía solo con los claims del JWT, que son una foto del
 * momento del login. Desactivar a un empleado ponía `users.activo = false` pero
 * no invalidaba su token: conservaba acceso operativo completo mientras su
 * navegador siguiera abierto, porque el refresh token seguía renovando.
 *
 * Un desajuste entre el JWT y la fila del usuario obliga a volver a iniciar
 * sesión, en lugar de dejar que la app y la RLS discrepen en silencio.
 */
async function assertSesionVigente(
  userId: string,
  role: UserRole,
  tenantId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from('users')
    .select('activo, role, tenant_id, deleted_at')
    .eq('id', userId)
    .maybeSingle();

  if (!perfil || perfil.deleted_at !== null || perfil.activo !== true) {
    throw new AppError(
      'SESSION_REVOKED',
      401,
      'Tu cuenta ya no está activa. Inicia sesión de nuevo.',
    );
  }

  if (perfil.role !== role || perfil.tenant_id !== tenantId) {
    throw new AppError(
      'SESSION_STALE',
      401,
      'Tus permisos cambiaron. Cierra sesión y vuelve a entrar.',
    );
  }
}

export async function assertCan(permission: string): Promise<SessionContext> {
  const supabase = await createClient();
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

  await assertSesionVigente(user.id, role, tenantId);

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
