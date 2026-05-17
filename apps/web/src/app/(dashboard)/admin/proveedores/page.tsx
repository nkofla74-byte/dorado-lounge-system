import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { assertCan } from '@/lib/auth/assertCan';
import { getProveedores } from '@/modules/proveedores/actions';
import { ProveedoresPanel } from '@/components/proveedores/proveedores-panel';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('proveedores');
  return { title: t('metaTitle') };
}

export default async function ProveedoresPage() {
  const t = await getTranslations('proveedores');
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
        <h1 className="text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('pageSubtitle')}</p>
      </div>
      <ProveedoresPanel initialData={proveedores} canWrite={canWrite} />
    </div>
  );
}
