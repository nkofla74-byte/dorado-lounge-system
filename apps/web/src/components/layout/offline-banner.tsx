'use client';

import { useTranslations } from 'next-intl';
import { useOfflineSync } from '@/lib/offline/use-offline-sync';
import { WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineBanner() {
  const t = useTranslations('layout.offline');
  const { isOnline, pendingCount, syncing } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-caption font-medium',
        isOnline ? 'bg-senal-curso text-background' : 'bg-senal-aviso text-background',
      )}
    >
      {isOnline ? (
        <>
          <RefreshCw className={cn('size-4 shrink-0', syncing && 'motion-safe:animate-spin')} />
          <span>{syncing ? t('syncing') : t('pendingSync', { count: pendingCount })}</span>
        </>
      ) : (
        <>
          <WifiOff className="size-4 shrink-0" />
          <span>
            {pendingCount > 0
              ? t('noConnectionWithSaved', { count: pendingCount })
              : t('noConnectionEmpty')}
          </span>
        </>
      )}
    </div>
  );
}
