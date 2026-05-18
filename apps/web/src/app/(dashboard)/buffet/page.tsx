import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getDespachos, getTurnosActivos, getRecetasServicioBuffet } from '@/modules/buffet/actions';
import { BuffetPanel } from '@/components/buffet/buffet-panel';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('buffet');
  return { title: t('metaTitle') };
}

export default async function BuffetPage() {
  const t = await getTranslations('buffet');
  const supabase = await createClient();

  const [despachosResult, turnosResult, recetasResult, { data: authData }] = await Promise.all([
    getDespachos(),
    getTurnosActivos(),
    getRecetasServicioBuffet(),
    supabase.auth.getUser(),
  ]);

  const userRole = authData.user?.app_metadata?.role as UserRole | undefined;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>
      <BuffetPanel
        initialDespachos={despachosResult.ok ? despachosResult.value : []}
        recetas={recetasResult.ok ? recetasResult.value : []}
        turnos={turnosResult.ok ? turnosResult.value : []}
        userRole={userRole}
        error={despachosResult.ok ? undefined : despachosResult.error.message}
      />
    </div>
  );
}
