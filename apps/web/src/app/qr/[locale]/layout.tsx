import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme/theme-provider';
import '@/app/globals.css';

const LOCALES = ['es', 'en', 'fr', 'pt'] as const;
type Locale = (typeof LOCALES)[number];

async function loadMessages(locale: Locale) {
  const messages = {
    es: () => import('@/messages/es.json'),
    en: () => import('@/messages/en.json'),
    fr: () => import('@/messages/fr.json'),
    pt: () => import('@/messages/pt.json'),
  };
  return (await messages[locale]()).default;
}

export default async function QRLocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const locale = params.locale as Locale;
  if (!LOCALES.includes(locale)) notFound();

  const messages = await loadMessages(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider defaultTheme="system">
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
