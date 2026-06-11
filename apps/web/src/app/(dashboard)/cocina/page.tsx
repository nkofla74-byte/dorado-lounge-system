import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getTranslations } from 'next-intl/server';
import { getPedidosByArea } from '@/modules/orders/actions';
import { KdsBoardArea } from '@/components/kds/kds-board-area';

export const dynamic = 'force-dynamic';

// Vista supervisora del jefe de cocina (rol `chef`): los KDS de cocina
// caliente y fría en una sola pantalla. Los chefs de área usan sus rutas
// dedicadas (/cocina-caliente, /cocina-fria).
export default async function CocinaPage() {
  let ctx;
  try {
    ctx = await assertCan('cocina_caliente:read');
    await assertCan('cocina_fria:read');
  } catch {
    redirect('/inventario');
  }

  const t = await getTranslations('kds');
  const [caliente, fria] = await Promise.all([
    getPedidosByArea('cocina_caliente'),
    getPedidosByArea('cocina_fria'),
  ]);
  const readOnly = ctx.role === 'admin' || ctx.role === 'superuser';

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('tituloCocinaGeneral')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('subtituloCocinaGeneral')}</p>
      </div>

      <KdsBoardArea
        area="cocina_caliente"
        titulo={t('tituloCocinaCaliente')}
        subtitulo={t('subtituloCocinaCaliente')}
        initialPedidos={caliente.ok ? caliente.value : []}
        readOnly={readOnly}
        embedded
      />

      <KdsBoardArea
        area="cocina_fria"
        titulo={t('tituloCocinaFria')}
        subtitulo={t('subtituloCocinaFria')}
        initialPedidos={fria.ok ? fria.value : []}
        readOnly={readOnly}
        embedded
      />
    </div>
  );
}
