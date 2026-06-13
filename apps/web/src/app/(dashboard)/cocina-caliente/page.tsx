import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getTranslations } from 'next-intl/server';
import { getPedidosByArea } from '@/modules/orders/actions';
import { getInsumos } from '@/modules/inventory/actions';
import { getRequisicionesArea } from '@/modules/requisiciones/actions';
import { KdsBoardArea } from '@/components/kds/kds-board-area';
import { RequisicionesCocinaSection } from '@/components/requisiciones/requisiciones-cocina-section';
import type { InsumoOption } from '@/components/requisiciones/pedir-insumos-dialog';

export const dynamic = 'force-dynamic';

export default async function CocinaCalientePage() {
  let ctx;
  try {
    ctx = await assertCan('cocina_caliente:read');
  } catch {
    redirect('/inventario');
  }

  const t = await getTranslations('kds');
  const readOnly = ctx.role === 'admin' || ctx.role === 'superuser';

  const [pedidosResult, insumosResult, reqsResult] = await Promise.all([
    getPedidosByArea('cocina_caliente'),
    getInsumos(),
    getRequisicionesArea('cocina_caliente'),
  ]);
  const pedidos = pedidosResult.ok ? pedidosResult.value : [];
  const insumos: InsumoOption[] = (insumosResult.ok ? insumosResult.value : [])
    .filter((i) => i.capa === 'capa_1')
    .map((i) => ({ id: i.id, nombre: i.nombre, unidadMedida: i.unidadMedida }));
  const requisiciones = reqsResult.ok ? reqsResult.value : [];

  return (
    <div className="flex flex-col">
      <KdsBoardArea
        area="cocina_caliente"
        titulo={t('tituloCocinaCaliente')}
        subtitulo={t('subtituloCocinaCaliente')}
        initialPedidos={pedidos}
        readOnly={readOnly}
      />
      {!readOnly && (
        <RequisicionesCocinaSection
          area="cocina_caliente"
          insumos={insumos}
          initialRequisiciones={requisiciones}
        />
      )}
    </div>
  );
}
