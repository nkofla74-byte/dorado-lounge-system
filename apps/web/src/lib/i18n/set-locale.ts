'use server';

import { cookies } from 'next/headers';

const LOCALE_COOKIE = 'NEXT_LOCALE';
const SUPPORTED = ['es', 'en'] as const;
type DashboardLocale = (typeof SUPPORTED)[number];

export async function setLocaleCookie(locale: DashboardLocale): Promise<void> {
  if (!SUPPORTED.includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}

export async function getLocaleCookie(): Promise<DashboardLocale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return (SUPPORTED as readonly string[]).includes(value ?? '') ? (value as DashboardLocale) : 'es';
}
