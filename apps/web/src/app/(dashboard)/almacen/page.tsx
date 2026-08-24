import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getInsumos, getLotesProximosVencer } from '@/modules/inventory/actions';
import { getProveedores } from '@/modules/proveedores/actions';
import { getColaAlmacen } from '@/modules/requisiciones/actions';
import { AlmacenOperacionPanel } from '@/components/inventory/almacen-operacion-panel';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory.almacenPage');
  return { title: t('metaTitle') };
}

export default async function AlmacenPage() {
  const t = await getTranslations('inventory.almacenPage');
  const supabase = await createClient();
  const [
    insumosResult,
    vencimientosResult,
    proveedoresResult,
    colaResult,
    {
      data: { user },
    },
  ] = await Promise.all([
    getInsumos(),
    getLotesProximosVencer(7),
    getProveedores(),
    getColaAlmacen(),
    supabase.auth.getUser(),
  ]);

  const userRole = user?.app_metadata?.role as UserRole | undefined;
  const canIngresar =
    userRole === 'admin' || userRole === 'superuser' || userRole === 'personal_almacen';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
      <AlmacenOperacionPanel
        insumos={insumosResult.ok ? insumosResult.value : []}
        insumosError={insumosResult.ok ? undefined : insumosResult.error.message}
        vencimientos={vencimientosResult.ok ? vencimientosResult.value : []}
        proveedores={proveedoresResult.ok ? proveedoresResult.value : []}
        requisiciones={colaResult.ok ? colaResult.value : []}
        canIngresar={canIngresar}
        userRole={userRole}
      />
    </div>
  );
}
