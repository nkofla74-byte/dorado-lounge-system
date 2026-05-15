'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNetwork } from './use-network';
import { getQueueSize } from './queue';
import { syncPendingOrders } from './sync';

export interface SyncState {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
}

// Retorna el estado de conectividad y la cola pendiente.
// Dispara sincronización automática cuando la red vuelve.
export function useOfflineSync(): SyncState {
  const isOnline = useNetwork();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const n = await getQueueSize();
      setPendingCount(n);
    } catch {
      // IndexedDB no disponible (p.ej. modo incógnito con restricciones)
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncPendingOrders();
    } finally {
      setSyncing(false);
      await refreshCount();
    }
  }, [syncing, refreshCount]);

  // Cargar conteo inicial
  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // Sincronizar al recuperar red
  useEffect(() => {
    if (isOnline && wasOffline.current) {
      void sync();
    }
    wasOffline.current = !isOnline;
  }, [isOnline, sync]);

  return { isOnline, pendingCount, syncing };
}
