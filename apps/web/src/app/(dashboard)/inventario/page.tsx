import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getInsumos, getLotesProximosVencer } from '@/modules/inventory/actions';
import { getProveedores } from '@/modules/proveedores/actions';
import { getColaAlmacen } from '@/modules/requisiciones/actions';
import { InsumoTable } from '@/components/inventory/insumo-table';
import { InventarioView } from '@/components/inventory/inventario-view';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory');
  return { title: t('metaTitle') };
}

export default async function InventarioPage() {
  const t = await getTranslations('inventory');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userRole = user?.app_metadata?.role as UserRole | undefined;
  const isHub = userRole === 'admin' || userRole === 'superuser';

  // Vista unificada (hub) solo para admin/superuser: tabla + operación de bodega
  // en tabs. El resto de roles conserva la tabla de insumos como vista de stock.
  if (isHub) {
    const [insumosResult, vencimientosResult, proveedoresResult, colaResult] = await Promise.all([
      getInsumos(),
      getLotesProximosVencer(7),
      getProveedores(),
      getColaAlmacen(),
    ]);

    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight">{t('unifiedTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('unifiedSubtitle')}</p>
        </div>
        <InventarioView
          insumos={insumosResult.ok ? insumosResult.value : []}
          insumosError={insumosResult.ok ? undefined : insumosResult.error.message}
          vencimientos={vencimientosResult.ok ? vencimientosResult.value : []}
          proveedores={proveedoresResult.ok ? proveedoresResult.value : []}
          requisiciones={colaResult.ok ? colaResult.value : []}
          canIngresar
          userRole={userRole}
        />
      </div>
    );
  }

  const result = await getInsumos();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <InsumoTable
        initialData={result.ok ? result.value : []}
        error={result.ok ? undefined : result.error.message}
        userRole={userRole}
      />
    </div>
  );
}
