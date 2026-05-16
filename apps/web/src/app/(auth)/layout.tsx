import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [messages, locale] = await Promise.all([getMessages(), getLocale()]);
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <main className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        {children}
      </main>
    </NextIntlClientProvider>
  );
}
