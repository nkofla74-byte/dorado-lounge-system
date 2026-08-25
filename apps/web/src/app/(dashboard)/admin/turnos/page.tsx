import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getTurnos } from '@/modules/turnos/actions';
import { TurnosPanel } from '@/components/turnos/turnos-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('turnos');
  return { title: t('metaTitle') };
}

export default async function TurnosPage() {
  const t = await getTranslations('turnos');
  const res = await getTurnos();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-display font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
      <TurnosPanel
        initialTurnos={res.ok ? res.value : []}
        error={res.ok ? undefined : res.error.message}
      />
    </div>
  );
}
