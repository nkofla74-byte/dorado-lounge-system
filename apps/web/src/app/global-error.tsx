'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

const TEXTS = {
  es: {
    title: 'Error crítico del sistema',
    body: 'El error fue reportado automáticamente. Intentá recargar.',
    cta: 'Recargar',
  },
  en: {
    title: 'Critical system error',
    body: 'The error was automatically reported. Try reloading.',
    cta: 'Reload',
  },
};

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

  const lang =
    typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'es';
  const t = TEXTS[lang];

  return (
    <html lang={lang}>
      <body className="flex items-center justify-center min-h-screen bg-background text-foreground font-sans">
        <div className="flex flex-col items-center gap-4 text-center p-6">
          <p className="text-5xl font-bold text-muted-foreground/30">500</p>
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="text-sm text-muted-foreground">{t.body}</p>
          <button
            onClick={reset}
            className="mt-2 px-4 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
          >
            {t.cta}
          </button>
        </div>
      </body>
    </html>
  );
}
