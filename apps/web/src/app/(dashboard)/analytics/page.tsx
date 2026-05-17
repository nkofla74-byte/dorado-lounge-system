import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchCogsPerPassenger, fetchConsumoVsProduccion } from '@/modules/analytics/actions';
import { getTurnos } from '@/modules/turnos/actions';
import { AnalyticsPanel } from '@/components/analytics/analytics-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('analytics');
  return { title: t('metaTitle') };
}

export default async function AnalyticsPage() {
  const t = await getTranslations('analytics');
  const [cogsResult, consumoResult, turnosResult] = await Promise.all([
    fetchCogsPerPassenger(),
    fetchConsumoVsProduccion(),
    getTurnos(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <AnalyticsPanel
        initialCogs={cogsResult.ok ? cogsResult.value : []}
        initialConsumo={consumoResult.ok ? consumoResult.value : []}
        turnos={turnosResult.ok ? turnosResult.value : []}
        error={cogsResult.ok ? undefined : cogsResult.error.message}
      />
    </div>
  );
}
