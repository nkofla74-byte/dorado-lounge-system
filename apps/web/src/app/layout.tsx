import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { HabeasDataBanner } from '@/components/privacy/habeas-data-banner';

export const metadata: Metadata = {
  title: 'Dorado Lounge System',
  description: 'Sistema de gestión Sala VIP — Aeropuerto El Dorado',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4eb' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f17' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider defaultTheme="dark">
          {children}
          <HabeasDataBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
