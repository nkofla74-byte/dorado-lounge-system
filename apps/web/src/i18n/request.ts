import { getRequestConfig } from 'next-intl/server';

const LOCALES = ['es', 'en', 'fr', 'pt'] as const;
type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async ({ locale }) => {
  const safeLocale = (LOCALES as readonly string[]).includes(locale ?? '')
    ? (locale as Locale)
    : 'es';
  const messages = (await import(`../messages/${safeLocale}.json`)).default as Record<
    string,
    unknown
  >;
  return { locale: safeLocale, messages };
});
