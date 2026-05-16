import type { Metadata } from 'next';
import { getRecetas } from '@/modules/recipes/actions';
import { getCostosRecetas } from '@/modules/costos/actions';
import { CostosPanel } from '@/components/costos/costos-panel';

export const metadata: Metadata = {
  title: 'Costos — Dorado Lounge',
};

export default async function CostosPage() {
  const recetasResult = await getRecetas();
  const recetaIds = recetasResult.ok ? recetasResult.value.map((r) => r.id) : [];
  const costosResult = recetaIds.length > 0 ? await getCostosRecetas(recetaIds) : null;

  const recetas = recetasResult.ok ? recetasResult.value : [];
  const costos = costosResult?.ok ? costosResult.value : {};

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Costos en tiempo real</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Costo por porción calculado con el precio del lote activo más próximo a vencer (FEFO)
        </p>
      </div>
      <CostosPanel recetas={recetas} costos={costos} />
    </div>
  );
}
