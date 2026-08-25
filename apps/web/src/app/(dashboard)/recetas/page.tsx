import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getRecetas } from '@/modules/recipes/actions';
import { getInsumos } from '@/modules/inventory/actions';
import { getCostosRecetas } from '@/modules/costos/actions';
import { RecipeTable } from '@/components/recipes/recipe-table';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('recipes');
  return { title: t('metaTitle') };
}

export default async function RecetasPage() {
  const t = await getTranslations('recipes');
  const [recetasResult, insumosResult] = await Promise.all([getRecetas(), getInsumos()]);

  const recetaIds = recetasResult.ok ? recetasResult.value.map((r) => r.id) : [];
  const costosResult = recetaIds.length > 0 ? await getCostosRecetas(recetaIds) : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <RecipeTable
        initialData={recetasResult.ok ? recetasResult.value : []}
        insumos={insumosResult.ok ? insumosResult.value : []}
        initialCostos={costosResult?.ok ? costosResult.value : {}}
        error={recetasResult.ok ? undefined : recetasResult.error.message}
      />
    </div>
  );
}
