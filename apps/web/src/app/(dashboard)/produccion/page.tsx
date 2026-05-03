import type { Metadata } from 'next';
import { getTandas } from '@/modules/production/actions';
import { getRecetas } from '@/modules/recipes/actions';
import { TandaTable } from '@/components/production/tanda-table';

export const metadata: Metadata = {
  title: 'Producción — Dorado Lounge',
};

export default async function ProduccionPage() {
  const [tandasResult, recetasResult] = await Promise.all([getTandas(), getRecetas()]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Producción</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tandas de cocina — FEFO automático al completar
        </p>
      </div>
      <TandaTable
        initialData={tandasResult.ok ? tandasResult.value : []}
        recetas={recetasResult.ok ? recetasResult.value : []}
        error={tandasResult.ok ? undefined : tandasResult.error.message}
      />
    </div>
  );
}
