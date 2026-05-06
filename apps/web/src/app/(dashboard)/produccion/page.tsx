import type { Metadata } from 'next';
import { getTandas } from '@/modules/production/actions';
import { getRecetas } from '@/modules/recipes/actions';
import { getTurnoActivo } from '@/modules/turnos/actions';
import { TandaTable } from '@/components/production/tanda-table';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Producción — Dorado Lounge',
};

export default async function ProduccionPage() {
  const supabase = createClient();
  const [tandasResult, recetasResult, turnoResult, { data: userData }] = await Promise.all([
    getTandas(),
    getRecetas(),
    getTurnoActivo(),
    supabase.auth.getUser(),
  ]);

  const user = userData.user;
  const userRole = user?.app_metadata?.role as string | undefined;
  const responsableNombre =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Usuario';

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
        turnoActivo={turnoResult.ok ? turnoResult.value : null}
        responsableNombre={responsableNombre}
        error={tandasResult.ok ? undefined : tandasResult.error.message}
        userRole={userRole}
      />
    </div>
  );
}
