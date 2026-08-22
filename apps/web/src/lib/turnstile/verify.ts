'use server';

import { headers } from 'next/headers';
import { rateLimit } from '@/lib/rate-limit';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited' | 'invalid_token' | 'verify_failed' };

export async function verifyTurnstile(token: string): Promise<TurnstileResult> {
  // Rate limit por IP (5/15min) — defense-in-depth contra abuso del endpoint.
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
  const rl = await rateLimit('login', ip);
  if (!rl.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const secret = process.env['TURNSTILE_SECRET_KEY'];
  if (!secret) {
    // En producción, un secreto ausente es un fallo de configuración, no una
    // invitación a saltarse la verificación (F-013). Mismo criterio que los
    // buckets fail-closed de lib/rate-limit.
    if (process.env['NODE_ENV'] === 'production') return { ok: false, reason: 'verify_failed' };
    return { ok: true }; // sin configurar en desarrollo local
  }

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token }),
    cache: 'no-store',
  });

  if (!res.ok) return { ok: false, reason: 'verify_failed' };

  const data: TurnstileResponse = await res.json();
  return data.success === true ? { ok: true } : { ok: false, reason: 'invalid_token' };
}
