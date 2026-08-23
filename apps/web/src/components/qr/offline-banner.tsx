'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  locale?: string;
}

interface BannerTexts {
  offline: string;
  pending: (n: number) => string;
  syncing: string;
}

const TEXTS: Record<string, BannerTexts> = {
  es: {
    offline: 'Sin conexión — tu pedido se enviará al recuperar la red',
    pending: (n) => `${n} pedido${n > 1 ? 's' : ''} pendiente${n > 1 ? 's' : ''} de enviar`,
    syncing: 'Sincronizando pedidos…',
  },
  en: {
    offline: 'No connection — your order will be sent when back online',
    pending: (n) => `${n} pending order${n > 1 ? 's' : ''} to send`,
    syncing: 'Syncing orders…',
  },
  fr: {
    offline: 'Hors ligne — votre commande sera envoyée à la reconnexion',
    pending: (n) => `${n} commande${n > 1 ? 's' : ''} en attente`,
    syncing: 'Synchronisation…',
  },
  pt: {
    offline: 'Sem conexão — seu pedido será enviado ao reconectar',
    pending: (n) => `${n} pedido${n > 1 ? 's' : ''} pendente${n > 1 ? 's' : ''}`,
    syncing: 'Sincronizando pedidos…',
  },
};

export function OfflineBanner({
  isOnline,
  pendingCount,
  syncing,
  locale = 'es',
}: OfflineBannerProps) {
  const t: BannerTexts = TEXTS[locale] ?? TEXTS['es']!;

  const hidden = isOnline && pendingCount === 0 && !syncing;
  if (hidden) return null;

  const message = syncing ? t.syncing : !isOnline ? t.offline : t.pending(pendingCount);
  const isError = !isOnline;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2',
        'px-4 py-2 text-caption font-medium text-white transition-all',
        isError ? 'bg-destructive' : 'bg-amber-500',
      )}
    >
      {syncing ? (
        <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
      ) : (
        <WifiOff className="h-3 w-3 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}
