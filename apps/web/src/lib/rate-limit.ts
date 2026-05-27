import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiter centralizado con Upstash Redis. Es "fail-open" en dev:
// si las env vars no están seteadas, todo pasa (no rompe el flujo local).
// En producción Vercel, configurar:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const hasUpstash =
  !!process.env['UPSTASH_REDIS_REST_URL'] && !!process.env['UPSTASH_REDIS_REST_TOKEN'];

const redis = hasUpstash ? Redis.fromEnv() : null;

// Buckets de rate limiting por caso de uso.
// Sliding window: ventana móvil, evita spikes al borde.
const limiters = {
  // Login: 5 intentos por IP cada 15 min.
  // Complementa a Turnstile y al rate limit nativo de Supabase Auth.
  login: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'rl:login' })
    : null,

  // Cron alertas: 10 hits por IP/min — más de lo que pg_cron normal hace (12/h).
  cron: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:cron' })
    : null,

  // Heartbeat: 60 por IP/min. Es generoso porque Better Stack reintenta.
  heartbeat: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'rl:heart' })
    : null,

  // GDPR forget: 3 por usuario/día. Si te equivocas, esperas un día.
  gdpr: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '1 d'), prefix: 'rl:gdpr' })
    : null,

  // QR público: evita spam de pedidos desde un token de mesa válido.
  qrOrder: redis
    ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(6, '10 m'), prefix: 'rl:qr-order' })
    : null,
} as const;

export type RateLimitBucket = keyof typeof limiters;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // ms epoch when the window resets
}

const failClosedBuckets = new Set<RateLimitBucket>(['login', 'gdpr', 'qrOrder']);

export async function rateLimit(
  bucket: RateLimitBucket,
  identifier: string,
): Promise<RateLimitResult> {
  const rl = limiters[bucket];
  if (!rl) {
    if (process.env['NODE_ENV'] === 'production' && failClosedBuckets.has(bucket)) {
      return { allowed: false, remaining: 0, reset: 0 };
    }

    // No Upstash configurado en dev — fail-open con valores neutros.
    return { allowed: true, remaining: 999, reset: 0 };
  }
  const result = await rl.limit(identifier);
  return {
    allowed: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}

export function getClientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}
