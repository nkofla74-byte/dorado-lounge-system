'use client';

import { useOfflineSync } from '@/lib/offline/use-offline-sync';
import { WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineBanner() {
  const { isOnline, pendingCount, syncing } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium',
        isOnline ? 'bg-blue-500/90 text-white' : 'bg-amber-500 text-white',
      )}
    >
      {isOnline ? (
        <>
          <RefreshCw className={cn('h-3.5 w-3.5 shrink-0', syncing && 'animate-spin')} />
          <span>
            {syncing
              ? 'Sincronizando pedidos pendientes…'
              : `${pendingCount} pedido${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''} por sincronizar`}
          </span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            Sin conexión
            {pendingCount > 0
              ? ` — ${pendingCount} pedido${pendingCount !== 1 ? 's' : ''} guardado${pendingCount !== 1 ? 's' : ''}, se enviará${pendingCount !== 1 ? 'n' : ''} al recuperar la red`
              : ' — los pedidos se guardarán localmente'}
          </span>
        </>
      )}
    </div>
  );
}
