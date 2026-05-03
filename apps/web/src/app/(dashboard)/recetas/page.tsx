import type { Metadata } from 'next';
import { getRecetas } from '@/modules/recipes/actions';
import { getInsumos } from '@/modules/inventory/actions';
import { RecipeTable } from '@/components/recipes/recipe-table';

export const metadata: Metadata = {
  title: 'Recetas — Dorado Lounge',
};

export default async function RecetasPage() {
  const [recetasResult, insumosResult] = await Promise.all([getRecetas(), getInsumos()]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recetas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recetas de producción y servicio con ingredientes y coeficientes de merma
        </p>
      </div>
      <RecipeTable
        initialData={recetasResult.ok ? recetasResult.value : []}
        insumos={insumosResult.ok ? insumosResult.value : []}
        error={recetasResult.ok ? undefined : recetasResult.error.message}
      />
    </div>
  );
}
