import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function CocinaCalientePage() {
  try {
    await assertCan('cocina_caliente:read');
  } catch {
    redirect('/inventario');
  }

  const t = await getTranslations('kds');

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('tituloCocinaCaliente')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtituloCocinaCaliente')}</p>
      </div>
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        {t('sinSolicitudes')}
      </div>
    </div>
  );
}
