import createNextIntlPlugin from 'next-intl/plugin';
import { withAxiom } from 'next-axiom';
import { withBetterStackNextConfig } from '@logtail/next';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';

    // Domains that vary per environment — read from env at runtime
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : '*.supabase.co';
    const socketUrl = new URL(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001');
    const socketConnectSrc =
      socketUrl.protocol === 'https:'
        ? [`https://${socketUrl.host}`, `wss://${socketUrl.host}`]
        : [`http://${socketUrl.host}`, `ws://${socketUrl.host}`];

    const csp = [
      "default-src 'self'",
      // Next.js requires 'unsafe-eval' in dev for HMR; inline styles from Tailwind
      isProd
        ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://browser.sentry-cdn.com"
        : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      [
        'connect-src',
        "'self'",
        `https://${supabaseHost}`,
        `wss://${supabaseHost}`,
        ...socketConnectSrc,
        'https://challenges.cloudflare.com',
        'https://*.ingest.sentry.io',
        'https://*.axiom.co',
        // Better Stack Logs + heartbeat
        'https://in.logs.betterstack.com',
        'https://betteruptime.com',
      ].join(' '),
      "font-src 'self' data:",
      "img-src 'self' data: https:",
      // Turnstile widget renders inside an iframe from Cloudflare
      'frame-src https://challenges.cloudflare.com',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(isProd ? ['upgrade-insecure-requests'] : []),
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

const withIntl = withNextIntl(nextConfig);
const withLogs = withAxiom(withIntl);
const withBetterStack = withBetterStackNextConfig(withLogs);

export default withSentryConfig(withBetterStack, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
});
