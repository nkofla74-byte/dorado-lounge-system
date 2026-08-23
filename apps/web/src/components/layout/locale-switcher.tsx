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
  compact?: boolean;
}

export function LocaleSwitcher({ current, compact = false }: LocaleSwitcherProps) {
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

  // Compact: un solo botón que muestra el locale opuesto y cicla al click.
  // Pensado para el top bar móvil donde el espacio es crítico.
  if (compact) {
    const next = LOCALES.find((l) => l.code !== current) ?? LOCALES[0]!;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 px-3 text-caption font-semibold tabular-nums"
        onClick={() => handleSwitch(next.code)}
        disabled={isPending}
        aria-label={`Cambiar a ${next.label}`}
      >
        {current.toUpperCase()}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1">
      {LOCALES.map(({ code, label }) => (
        <Button
          key={code}
          variant={current === code ? 'secondary' : 'ghost'}
          size="sm"
          className="min-h-11 px-3 text-caption"
          onClick={() => handleSwitch(code)}
          disabled={current === code || isPending}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
