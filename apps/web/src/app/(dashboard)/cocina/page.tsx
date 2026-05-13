import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getPedidos } from '@/modules/orders/actions';
import { KdsBoard } from '@/components/kds/kds-board';

export const dynamic = 'force-dynamic';

export default async function CocinaPage() {
  try {
    await assertCan('orders:read');
  } catch {
    redirect('/inventario');
  }

  const result = await getPedidos();
  const pedidos = result.ok ? result.value : [];

  return <KdsBoard initialPedidos={pedidos} />;
}
