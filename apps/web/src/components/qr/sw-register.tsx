'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/qr/' }).catch(() => {
      // SW registration failure is non-critical — app still works without it
    });
  }, []);

  return null;
}
