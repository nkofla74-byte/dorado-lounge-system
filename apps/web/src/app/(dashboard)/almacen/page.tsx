import type { Metadata } from 'next';
import { getInsumos } from '@/modules/inventory/actions';
import { AlmacenPanel } from '@/components/inventory/almacen-panel';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export const metadata: Metadata = {
  title: 'Almacén — Dorado Lounge',
};

export default async function AlmacenPage() {
  const supabase = createClient();
  const [
    result,
    {
      data: { user },
    },
  ] = await Promise.all([getInsumos(), supabase.auth.getUser()]);

  const userRole = user?.app_metadata?.role as UserRole | undefined;
  const insumos = result.ok ? result.value : [];
  const capa1 = insumos.filter((i) => i.capa === 'capa_1');
  const lowStock = capa1.filter((i) => i.stockActual <= i.stockMinimo);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Almacén</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ingreso de materia prima · Control de bodega
        </p>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Insumos bodega
          </p>
          <p className="text-2xl font-bold tabular-nums">{capa1.length}</p>
        </div>
        <div
          className={`rounded-lg border px-5 py-4 space-y-1 ${
            lowStock.length > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Stock bajo mínimo
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              lowStock.length > 0 ? 'text-destructive' : ''
            }`}
          >
            {lowStock.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            OK en stock
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {capa1.length - lowStock.length}
          </p>
        </div>
      </div>

      {result.ok ? (
        <AlmacenPanel initialData={capa1} userRole={userRole} />
      ) : (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-md">
          {result.error.message}
        </div>
      )}
    </div>
  );
}
