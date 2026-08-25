import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getRecetas } from '@/modules/recipes/actions';
import { getCostosRecetas } from '@/modules/costos/actions';
import { CostosPanel } from '@/components/costos/costos-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('costos');
  return { title: t('metaTitle') };
}

export default async function CostosPage() {
  const t = await getTranslations('costos');
  const recetasResult = await getRecetas();
  const recetaIds = recetasResult.ok ? recetasResult.value.map((r) => r.id) : [];
  const costosResult = recetaIds.length > 0 ? await getCostosRecetas(recetaIds) : null;

  const recetas = recetasResult.ok ? recetasResult.value : [];
  const costos = costosResult?.ok ? costosResult.value : {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <CostosPanel recetas={recetas} costos={costos} />
    </div>
  );
}
