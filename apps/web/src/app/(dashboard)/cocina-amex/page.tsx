import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getPedidosAmex } from '@/modules/orders/actions';
import { KdsBoardAmex } from '@/components/kds/kds-board-amex';

export const dynamic = 'force-dynamic';

export default async function CocinaAmexPage() {
  try {
    await assertCan('cocina_amex:read');
  } catch {
    redirect('/inventario');
  }

  const result = await getPedidosAmex();
  const pedidos = result.ok ? result.value : [];

  return <KdsBoardAmex initialPedidos={pedidos} />;
}
