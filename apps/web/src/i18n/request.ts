import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const QR_LOCALES = ['es', 'en', 'fr', 'pt'] as const;
const DASHBOARD_LOCALES = ['es', 'en'] as const;
type Locale = (typeof QR_LOCALES)[number];

async function resolveLocale(locale: string | undefined): Promise<Locale> {
  // URL-based locale (QR routes /qr/[locale])
  if (locale && (QR_LOCALES as readonly string[]).includes(locale)) {
    return locale as Locale;
  }
  // Cookie-based locale (dashboard routes)
  const store = await cookies();
  const cookie = store.get('NEXT_LOCALE')?.value;
  if (cookie && (DASHBOARD_LOCALES as readonly string[]).includes(cookie)) {
    return cookie as Locale;
  }
  return 'es';
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const safeLocale = await resolveLocale(requested);
  const messages = (await import(`../messages/${safeLocale}.json`)).default as Record<
    string,
    unknown
  >;
  return { locale: safeLocale, messages };
});
