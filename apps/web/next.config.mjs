import createNextIntlPlugin from 'next-intl/plugin';
import { withAxiom } from 'next-axiom';
import { withBetterStackNextConfig } from '@logtail/next';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';

    // La Content-Security-Policy NO se define aquí: necesita un nonce por
    // petición y next.config solo admite cabeceras estáticas. La construye el
    // middleware (lib/security/csp.ts) — ver F-019 de la auditoría 2026-08-22.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
