'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: 'light' | 'dark' | 'system';
  storageKey?: string;
  /**
   * Nonce de la CSP de esta respuesta. next-themes inyecta un <script> inline
   * que fija el tema ANTES del primer pintado; sin nonce, la CSP con
   * 'strict-dynamic' de F-019 lo bloquea y la página aparece con el tema
   * equivocado hasta que React hidrata. Lo pasa el layout desde `x-nonce`.
   */
  nonce?: string | undefined;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'dorado-theme',
  nonce,
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      storageKey={storageKey}
      disableTransitionOnChange
      {...(nonce ? { nonce } : {})}
    >
      {children}
    </NextThemesProvider>
  );
}
