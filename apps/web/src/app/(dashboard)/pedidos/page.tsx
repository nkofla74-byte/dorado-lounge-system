import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getPedidos } from '@/modules/orders/actions';
import { getRecetas } from '@/modules/recipes/actions';
import { PedidoTable } from '@/components/orders/pedido-table';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pedidos');
  return { title: t('metaTitle') };
}

export default async function PedidosPage() {
  const t = await getTranslations('pedidos');
  const supabase = await createClient();

  const [pedidosResult, recetasResult, { data: authData }] = await Promise.all([
    getPedidos(),
    getRecetas(),
    supabase.auth.getUser(),
  ]);

  const userRole = authData.user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <PedidoTable
        initialData={pedidosResult.ok ? pedidosResult.value : []}
        recetas={recetasResult.ok ? recetasResult.value : []}
        userRole={userRole}
        error={pedidosResult.ok ? undefined : pedidosResult.error.message}
      />
    </div>
  );
}
