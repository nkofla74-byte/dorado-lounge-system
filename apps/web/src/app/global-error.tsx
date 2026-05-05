'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
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
    <html lang="es">
      <body className="flex items-center justify-center min-h-screen bg-background text-foreground font-sans">
        <div className="flex flex-col items-center gap-4 text-center p-6">
          <p className="text-5xl font-bold text-muted-foreground/30">500</p>
          <h2 className="text-lg font-semibold">Error crítico del sistema</h2>
          <p className="text-sm text-muted-foreground">
            El error fue reportado automáticamente. Intentá recargar.
          </p>
          <button
            onClick={reset}
            className="mt-2 px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
