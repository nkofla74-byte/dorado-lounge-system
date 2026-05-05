import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTenants } from '@/modules/superuser/actions';
import { TenantsPanel } from '@/components/superuser/tenants-panel';

export default async function TenantsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.app_metadata?.role !== 'superuser') redirect('/');

  const result = await getTenants();
  const tenants = result.ok ? result.value : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestión de tenants</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crea y administra los tenants de la plataforma
        </p>
      </div>

      {!result.ok && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          Error al cargar tenants: {result.error.message}
        </div>
      )}

      <TenantsPanel initialTenants={tenants} />
    </div>
  );
}
