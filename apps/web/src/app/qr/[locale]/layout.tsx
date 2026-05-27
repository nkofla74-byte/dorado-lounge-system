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
    <ThemeProvider defaultTheme="light" storageKey="dorado-qr-theme">
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
      <ServiceWorkerRegistrar />
    </ThemeProvider>
  );
}

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
