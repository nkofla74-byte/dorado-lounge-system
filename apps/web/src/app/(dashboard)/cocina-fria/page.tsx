import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getTranslations } from 'next-intl/server';
import { getPedidosByArea } from '@/modules/orders/actions';
import { KdsBoardArea } from '@/components/kds/kds-board-area';

export const dynamic = 'force-dynamic';

export default async function CocinaFriaPage() {
  let ctx;
  try {
    ctx = await assertCan('cocina_fria:read');
  } catch {
    redirect('/inventario');
  }

  const t = await getTranslations('kds');
  const result = await getPedidosByArea('cocina_fria');
  const pedidos = result.ok ? result.value : [];
  const readOnly = ctx.role === 'admin' || ctx.role === 'superuser';

  return (
    <KdsBoardArea
      area="cocina_fria"
      titulo={t('tituloCocinaFria')}
      subtitulo={t('subtituloCocinaFria')}
      initialPedidos={pedidos}
      readOnly={readOnly}
    />
  );
}
