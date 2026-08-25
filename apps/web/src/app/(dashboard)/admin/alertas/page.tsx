import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { assertCan } from '@/lib/auth/assertCan';
import { getAlertasAdmin } from '@/modules/alertas/actions';
import { AlertasAdminPanel } from '@/components/alertas/alertas-admin-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('alertasAdmin');
  return { title: t('metaTitle') };
}

export default async function AlertasAdminPage() {
  const t = await getTranslations('alertasAdmin');
  let role: string;
  try {
    const ctx = await assertCan('alertas:write');
    role = ctx.role;
  } catch {
    redirect('/inventario');
  }

  const result = await getAlertasAdmin();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <AlertasAdminPanel
        initialData={result.ok ? result.value : []}
        showTenant={role === 'superuser'}
      />
    </div>
  );
}
