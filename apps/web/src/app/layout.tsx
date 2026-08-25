import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { GeistMono } from 'geist/font/mono';
import { Fraunces, Onest } from 'next/font/google';

// TIPOGRAFÍA — decisión de marca, 2026-08-22.
//
// Geist Sans era el cuerpo: una grotesca impecable, pero es la fuente de
// Vercel y lee a «herramienta de desarrollo», no a sala VIP. Playfair Display
// era el display: elegante y a la vez el serif por defecto de medio mundo, y
// sus astas finas desaparecen en la tablet de cocina con brillo alto.
//
// Onest para la interfaz: humanista, cálida, de aperturas abiertas — se lee
// bien a un brazo de distancia, que es la restricción que manda aquí.
const onest = Onest({
  subsets: ['latin'],
  variable: '--font-onest',
  display: 'swap',
});

// Fraunces para los momentos de marca. Serif de contraste alto con eje óptico
// (`opsz`): el propio tipo ajusta el grosor de sus astas según el tamaño, así
// que aguanta el reflejo donde Playfair se rompía. Da el registro de hotelería
// que pedía el cliente sin caer en el serif de invitación de boda.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { HabeasDataBanner } from '@/components/privacy/habeas-data-banner';

export const metadata: Metadata = {
  title: 'Dorado Lounge System',
  description: 'Sistema de gestión Sala VIP — Aeropuerto El Dorado',
  manifest: '/staff-manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'DL Staff',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  // Hex literales por obligación: una etiqueta <meta> no lee variables CSS.
  // Son el color del cromo del navegador y deben seguir a --background.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4eb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f17' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [messages, locale, headerList] = await Promise.all([getMessages(), getLocale(), headers()]);
  // Lo pone el middleware por respuesta; sin él, la CSP bloquea el script de
  // tema previo al pintado de next-themes.
  const nonce = headerList.get('x-nonce') ?? undefined;

  return (
    <html
      lang={locale}
      // Sin `dark` escrito a mano: lo pone next-themes desde su script previo
      // al pintado, según lo guardado o `defaultTheme`. Tenerlo aquí solo
      // duplicaba la decisión y obligaba a corregir la clase en la hidratación.
      className={`${onest.variable} ${GeistMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider defaultTheme="dark" nonce={nonce}>
            {children}
            <HabeasDataBanner />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
