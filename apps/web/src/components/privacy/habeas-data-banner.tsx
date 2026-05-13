'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CONSENT_KEY = 'dl_privacy_consent';

export function HabeasDataBanner() {
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
      aria-label="Aviso de privacidad"
      className={cn(
        'fixed bottom-0 inset-x-0 z-[100] bg-background border-t shadow-lg',
        'px-4 py-4 sm:px-6',
      )}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-muted-foreground flex-1">
          Este sistema almacena datos operativos de acuerdo con la{' '}
          <strong className="text-foreground">Ley 1581 de 2012 (Habeas Data)</strong>. Sus datos se
          usan exclusivamente para la operación del Dorado Lounge y se eliminan a los 90 días de su
          desvinculación. Puede solicitar su eliminación en cualquier momento.{' '}
          <a
            href="/privacidad"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Política de privacidad
          </a>
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleReject}>
            Rechazar
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
}
