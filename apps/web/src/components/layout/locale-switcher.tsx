'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { setLocaleCookie } from '@/lib/i18n/set-locale';

const LOCALES = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
] as const;

type Locale = (typeof LOCALES)[number]['code'];

interface LocaleSwitcherProps {
  current: Locale;
}

export function LocaleSwitcher({ current }: LocaleSwitcherProps) {
  const [, startTransition] = useTransition();

  const handleSwitch = (locale: Locale) => {
    startTransition(async () => {
      await setLocaleCookie(locale);
    });
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1">
      {LOCALES.map(({ code, label }) => (
        <Button
          key={code}
          variant={current === code ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => handleSwitch(code)}
          disabled={current === code}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
