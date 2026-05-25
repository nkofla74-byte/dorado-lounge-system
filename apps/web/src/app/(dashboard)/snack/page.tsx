import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import {
  getDespachos,
  getStuartRequests,
  getSolicitudesPreparacion,
} from '@/modules/snack/actions';
import { getInsumos } from '@/modules/inventory/actions';
import { SnackPanel } from '@/components/snack/snack-panel';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('snack');
  return { title: t('metaTitle') };
}

export default async function SnackPage() {
  const t = await getTranslations('snack');
  const supabase = await createClient();

  const [despachosResult, stuartResult, solicitudesResult, insumosResult, { data: authData }] =
    await Promise.all([
      getDespachos(),
      getStuartRequests(),
      getSolicitudesPreparacion(),
      getInsumos(),
      supabase.auth.getUser(),
    ]);

  const userRole = authData.user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <SnackPanel
        initialDespachos={despachosResult.ok ? despachosResult.value : []}
        initialStuart={stuartResult.ok ? stuartResult.value : []}
        initialSolicitudes={solicitudesResult.ok ? solicitudesResult.value : []}
        insumos={insumosResult.ok ? insumosResult.value : []}
        userRole={userRole}
        error={despachosResult.ok ? undefined : despachosResult.error.message}
      />
    </div>
  );
}
