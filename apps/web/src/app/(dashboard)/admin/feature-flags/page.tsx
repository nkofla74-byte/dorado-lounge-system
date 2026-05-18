import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/modules/feature-flags/actions';
import { FeatureFlagsPanel } from '@/components/feature-flags/feature-flags-panel';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.featureFlags');
  return { title: t('metaTitle') };
}

export default async function FeatureFlagsPage() {
  const t = await getTranslations('admin.featureFlags');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role as UserRole | undefined;
  if (!role || !['admin', 'superuser'].includes(role)) redirect('/');

  const result = await getFeatureFlags();
  const flags = result.ok ? result.value : [];
  const canWrite = role === 'superuser';

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>

      {!result.ok && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {t('errorCarga', { message: result.error.message })}
        </div>
      )}

      <FeatureFlagsPanel flags={flags} canWrite={canWrite} />
    </div>
  );
}
