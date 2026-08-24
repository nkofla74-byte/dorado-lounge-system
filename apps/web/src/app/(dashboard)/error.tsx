'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <h2 className="text-title font-semibold">{t('dashboardTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        {t('intentarDeNuevo')}
      </Button>
    </div>
  );
}
