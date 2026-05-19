import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ServiceWorkerRegistrar } from '@/components/qr/sw-register';
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
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  if (!LOCALES.includes(locale)) notFound();

  const messages = await loadMessages(locale);

  return (
    <html lang={locale} className="light" suppressHydrationWarning>
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#016FD0" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Dorado Lounge" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        {/* Favicon */}
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
      </head>
      <body className="antialiased">
        <ThemeProvider defaultTheme="light">
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
