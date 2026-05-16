'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function QRError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
      <div className="text-5xl">⚠️</div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Lo sentimos / We&apos;re sorry</h1>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error inesperado · An unexpected error occurred
        </p>
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
      >
        Reintentar / Retry
      </button>
    </div>
  );
}
