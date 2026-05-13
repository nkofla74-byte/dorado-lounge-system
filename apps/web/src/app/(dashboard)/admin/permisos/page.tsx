import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import type { UserRole } from '@dorado/shared-types';

export default async function PermisosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role as UserRole | undefined;
  if (!role || !['admin', 'superuser'].includes(role)) redirect('/');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Matriz de permisos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Permisos por rol — solo lectura. <strong>Superuser</strong> tiene acceso total (bypass de
          la matriz). Los cambios requieren modificar{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">lib/auth/permissions.ts</code>.
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
          Permitido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-muted-foreground/30" />
          Sin acceso
        </span>
        <span className="ml-auto text-muted-foreground/60 italic">
          Superuser: acceso total (no listado)
        </span>
      </div>

      <PermissionMatrix />
    </div>
  );
}
