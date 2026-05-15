import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getProveedores } from '@/modules/proveedores/actions';
import { ProveedoresPanel } from '@/components/proveedores/proveedores-panel';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export const dynamic = 'force-dynamic';

export default async function ProveedoresPage() {
  let canWrite = false;
  try {
    await assertCan('proveedores:read');
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const role = data.user?.app_metadata?.role as UserRole | undefined;
    canWrite = role ? (PERMISSIONS['proveedores:write']?.includes(role) ?? false) : false;
  } catch {
    redirect('/inventario');
  }

  const result = await getProveedores();
  const proveedores = result.ok ? result.value : [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gestión de proveedores e historial de compras por lote
        </p>
      </div>
      <ProveedoresPanel initialData={proveedores} canWrite={canWrite} />
    </div>
  );
}
