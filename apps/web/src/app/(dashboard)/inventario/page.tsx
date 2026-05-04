import type { Metadata } from 'next';
import { getInsumos } from '@/modules/inventory/actions';
import { InsumoTable } from '@/components/inventory/insumo-table';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export const metadata: Metadata = {
  title: 'Inventario — Dorado Lounge',
};

export default async function InventarioPage() {
  const supabase = createClient();
  const [
    result,
    {
      data: { user },
    },
  ] = await Promise.all([getInsumos(), supabase.auth.getUser()]);

  const userRole = user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-sm text-muted-foreground mt-1">Insumos y stock actual por capa</p>
      </div>
      <InsumoTable
        initialData={result.ok ? result.value : []}
        error={result.ok ? undefined : result.error.message}
        userRole={userRole}
      />
    </div>
  );
}
