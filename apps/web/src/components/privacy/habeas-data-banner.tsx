'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CONSENT_KEY = 'dl_privacy_consent';

export function HabeasDataBanner() {
  const t = useTranslations('layout.privacy');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) setVisible(true);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ accepted: true, at: new Date().toISOString() }),
    );
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ accepted: false, at: new Date().toISOString() }),
    );
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t('dialogLabel')}
      className={cn(
        'fixed bottom-0 inset-x-0 z-[100] bg-background border-t shadow-lg',
        'px-4 py-4 sm:px-6',
      )}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-muted-foreground flex-1">
          {t('messageBefore')} <strong className="text-foreground">{t('law')}</strong>.{' '}
          {t('messageAfter')}{' '}
          <a
            href="/privacidad"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {t('policyLink')}
          </a>
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleReject}>
            {t('reject')}
          </Button>
          <Button size="sm" onClick={handleAccept}>
            {t('accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
