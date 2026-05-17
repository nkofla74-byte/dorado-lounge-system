'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  const handleSwitch = (locale: Locale) => {
    if (locale === current) return;
    startTransition(async () => {
      await setLocaleCookie(locale);
      // Sin refresh el server component superior queda con el locale
      // anterior (la cookie cambia pero el HTML ya fue enviado al cliente).
      router.refresh();
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
