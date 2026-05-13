import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { HabeasDataBanner } from '@/components/privacy/habeas-data-banner';

const inter = Inter({ subsets: ['latin'] });

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
    { media: '(prefers-color-scheme: light)', color: '#f5f1e6' },
    { media: '(prefers-color-scheme: dark)', color: '#121417' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="dark">
          {children}
          <HabeasDataBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
