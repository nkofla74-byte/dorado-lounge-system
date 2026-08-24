import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getTenants } from '@/modules/superuser/actions';
import { TenantsPanel } from '@/components/superuser/tenants-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.tenantsPage');
  return { title: t('metaTitle') };
}

export default async function TenantsPage() {
  const t = await getTranslations('admin.tenantsPage');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.app_metadata?.role !== 'superuser') redirect('/');

  const result = await getTenants();
  const tenants = result.ok ? result.value : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {!result.ok && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {t('errorCarga', { message: result.error.message })}
        </div>
      )}

      <TenantsPanel initialTenants={tenants} />
    </div>
  );
}
