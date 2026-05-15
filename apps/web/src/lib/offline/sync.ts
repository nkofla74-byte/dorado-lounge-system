import { getQueuedOrders, removeQueuedOrder, incrementAttempts } from './queue';
import { createPedidoFromQR } from '@/app/qr/[locale]/actions';

export const MAX_SYNC_ATTEMPTS = 3;

export interface SyncResult {
  synced: number;
  failed: number;
  abandoned: number;
}

export async function syncPendingOrders(): Promise<SyncResult> {
  const orders = await getQueuedOrders();
  let synced = 0;
  let failed = 0;
  let abandoned = 0;

  for (const order of orders) {
    if (order.attempts >= MAX_SYNC_ATTEMPTS) {
      await removeQueuedOrder(order.id);
      abandoned++;
      continue;
    }
    try {
      const result = await createPedidoFromQR(order.input);
      if (result.ok) {
        await removeQueuedOrder(order.id);
        synced++;
      } else {
        await incrementAttempts(order.id);
        failed++;
      }
    } catch {
      await incrementAttempts(order.id);
      failed++;
    }
  }

  return { synced, failed, abandoned };
}
