import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { assertCan } from '@/lib/auth/assertCan';
import {
  getCartaElaboraciones,
  getPedidosZona,
  getPedidosTurnoZona,
} from '@/modules/orders/actions';
import { getTandasDisponiblesZona } from '@/modules/production/actions';
import { ZonaView } from '@/components/zonas/zona-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('zonaView');
  return { title: t('metaTitleBuffet') };
}

export default async function BuffetPage() {
  try {
    await assertCan('orders:create');
  } catch {
    redirect('/login');
  }

  const t = await getTranslations('zonaView');
  const [elaboraciones, pedidos, tandas, turnoPedidos] = await Promise.all([
    getCartaElaboraciones('buffet'),
    getPedidosZona('buffet'),
    getTandasDisponiblesZona('buffet'),
    getPedidosTurnoZona('buffet'),
  ]);

  return (
    <ZonaView
      zona="buffet"
      titulo={t('tituloBuffet')}
      elaboraciones={elaboraciones.ok ? elaboraciones.value : []}
      initialPedidos={pedidos.ok ? pedidos.value : []}
      initialTandas={tandas.ok ? tandas.value : []}
      initialTurnoPedidos={turnoPedidos.ok ? turnoPedidos.value : []}
    />
  );
}
