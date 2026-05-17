import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getTandas } from '@/modules/production/actions';
import { getRecetas } from '@/modules/recipes/actions';
import { getTurnoActivo } from '@/modules/turnos/actions';
import { TandaTable } from '@/components/production/tanda-table';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('production');
  return { title: t('metaTitle') };
}

export default async function ProduccionPage() {
  const t = await getTranslations('production');
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

  const isSteward = userRole === 'steward';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSteward ? t('pageTitleSteward') : t('pageTitleProd')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSteward ? t('pageSubtitleSteward') : t('pageSubtitleProd')}
        </p>
      </div>

      {isSteward && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t('stewardHint')}
        </div>
      )}

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
