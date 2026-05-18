import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getInsumos } from '@/modules/inventory/actions';
import { InsumoTable } from '@/components/inventory/insumo-table';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory');
  return { title: t('metaTitle') };
}

export default async function InventarioPage() {
  const t = await getTranslations('inventory');
  const supabase = await createClient();
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
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
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
