import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getTranslations } from 'next-intl/server';
import { getPedidosByArea } from '@/modules/orders/actions';
import { KdsBoardArea } from '@/components/kds/kds-board-area';

export const dynamic = 'force-dynamic';

export default async function CocinaCalientePage() {
  let ctx;
  try {
    ctx = await assertCan('cocina_caliente:read');
  } catch {
    redirect('/inventario');
  }

  const t = await getTranslations('kds');
  const result = await getPedidosByArea('cocina_caliente');
  const pedidos = result.ok ? result.value : [];
  const readOnly = ctx.role === 'admin' || ctx.role === 'superuser';

  return (
    <KdsBoardArea
      area="cocina_caliente"
      titulo={t('tituloCocinaCaliente')}
      subtitulo={t('subtituloCocinaCaliente')}
      initialPedidos={pedidos}
      readOnly={readOnly}
    />
  );
}
