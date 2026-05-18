import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getTurnos } from '@/modules/turnos/actions';
import { TurnosPanel } from '@/components/turnos/turnos-panel';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('turnos');
  return { title: t('metaTitle') };
}

export default async function TurnosPage() {
  const t = await getTranslations('turnos');
  const supabase = await createClient();

  const [turnosResult, { data: authData }] = await Promise.all([
    getTurnos(),
    supabase.auth.getUser(),
  ]);

  const userRole = authData.user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
      <TurnosPanel
        initialTurnos={turnosResult.ok ? turnosResult.value : []}
        userRole={userRole}
        error={turnosResult.ok ? undefined : turnosResult.error.message}
      />
    </div>
  );
}
