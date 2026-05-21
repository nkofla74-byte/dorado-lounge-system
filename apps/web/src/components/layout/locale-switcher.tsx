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
  const [isPending, startTransition] = useTransition();

  const handleSwitch = (locale: Locale) => {
    if (locale === current) return;
    startTransition(async () => {
      await setLocaleCookie(locale);
      // router.refresh() en Next.js 15 no siempre re-renderiza el layout que
      // depende de cookies(); usamos reload duro para garantizar que TODO el
      // árbol re-fetche con la nueva cookie NEXT_LOCALE.
      window.location.reload();
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
          disabled={current === code || isPending}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
