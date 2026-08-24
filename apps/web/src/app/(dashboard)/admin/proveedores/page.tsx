import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { assertCan } from '@/lib/auth/assertCan';
import { getProveedores } from '@/modules/proveedores/actions';
import { ProveedoresPanel } from '@/components/proveedores/proveedores-panel';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('proveedores');
  return { title: t('metaTitle') };
}

export default async function ProveedoresPage() {
  const t = await getTranslations('proveedores');
  let canWrite = false;
  let isSuperuser = false;
  try {
    const ctx = await assertCan('proveedores:read');
    const { role } = ctx;
    canWrite = PERMISSIONS['proveedores:write']?.includes(role) ?? false;
    isSuperuser = role === 'superuser';
    if (isSuperuser) canWrite = true;
  } catch {
    redirect('/inventario');
  }

  const result = await getProveedores();
  const proveedores = result.ok ? result.value : [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('pageSubtitle')}</p>
      </div>
      <ProveedoresPanel initialData={proveedores} canWrite={canWrite} showTenant={isSuperuser} />
    </div>
  );
}
