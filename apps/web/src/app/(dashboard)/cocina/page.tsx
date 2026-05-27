import { redirect } from 'next/navigation';
import { assertCan } from '@/lib/auth/assertCan';
import { getPedidos } from '@/modules/orders/actions';
import { KdsBoard } from '@/components/kds/kds-board';

export const dynamic = 'force-dynamic';

export default async function CocinaPage() {
  let ctx;
  try {
    ctx = await assertCan('orders:read');
  } catch {
    redirect('/inventario');
  }

  const result = await getPedidos();
  const pedidos = result.ok ? result.value : [];
  const readOnly = ctx.role === 'admin' || ctx.role === 'superuser';

  return <KdsBoard initialPedidos={pedidos} readOnly={readOnly} />;
}
