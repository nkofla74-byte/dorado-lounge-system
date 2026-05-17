import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AfluenciaPanel } from '@/components/afluencia/afluencia-panel';
import { getTurnoActivo } from '@/modules/turnos/actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('afluencia');
  return { title: t('metaTitle') };
}

export default async function AfluenciaPage() {
  const t = await getTranslations('afluencia');
  const turnoResult = await getTurnoActivo();
  const turnoActivo = turnoResult.ok && turnoResult.value ? turnoResult.value : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>

      <AfluenciaPanel
        turnoActivo={
          turnoActivo
            ? {
                id: turnoActivo.id,
                nombre: turnoActivo.nombre,
                teamlider: turnoActivo.teamlider,
                iniciadoAt: turnoActivo.iniciadoAt,
              }
            : null
        }
      />
    </div>
  );
}
