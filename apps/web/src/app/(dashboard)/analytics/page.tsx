import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { fetchConsumoVsProduccion } from '@/modules/analytics/actions';
import { getTurnos } from '@/modules/turnos/actions';
import { AnalyticsPanel } from '@/components/analytics/analytics-panel';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('analytics');
  return { title: t('metaTitle') };
}

export default async function AnalyticsPage() {
  const t = await getTranslations('analytics');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user?.app_metadata?.role as UserRole | undefined;
  const isSuperuser = role === 'superuser';

  // Para superuser ocultamos el selector de turnos: cada turno pertenece a una
  // sala específica y el filtro pierde sentido en una vista cross-tenant.
  const [consumoResult, turnosResult] = await Promise.all([
    fetchConsumoVsProduccion(),
    isSuperuser ? Promise.resolve(null) : getTurnos(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <AnalyticsPanel
        initialConsumo={consumoResult.ok ? consumoResult.value : []}
        turnos={turnosResult && turnosResult.ok ? turnosResult.value : []}
        showTenant={isSuperuser}
        error={consumoResult.ok ? undefined : consumoResult.error.message}
      />
    </div>
  );
}
