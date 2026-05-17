'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ThemeToggleProps {
  variant?: 'default' | 'compact';
}

export function ThemeToggle({ variant = 'default' }: ThemeToggleProps) {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={variant === 'compact' ? 'icon' : 'sm'}
        className="text-muted-foreground"
        aria-label={t('label')}
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const Icon = theme === 'light' ? Sun : theme === 'system' ? Monitor : Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'compact' ? 'icon' : 'sm'}
          className={
            variant === 'compact'
              ? 'h-8 w-8'
              : 'w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent'
          }
          aria-label={t('label')}
        >
          <Icon className="h-4 w-4" />
          {variant === 'default' && <span>{t('trigger')}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2">
          <Sun className="h-4 w-4" />
          {t('light')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2">
          <Moon className="h-4 w-4" />
          {t('dark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2">
          <Monitor className="h-4 w-4" />
          {t('system')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
