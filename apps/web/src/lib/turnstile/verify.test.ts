import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regresión de F-013: sin TURNSTILE_SECRET_KEY la verificación devolvía ok:true
// sin comprobar nada, también en producción. Un despliegue que perdiera el
// secreto desactivaba en silencio la protección anti-bot del login y del QR.

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => ({ allowed: true, remaining: 9, reset: 0 }),
}));

import { verifyTurnstile } from './verify';

const NODE_ENV_ORIGINAL = process.env['NODE_ENV'];

describe('verifyTurnstile sin secreto configurado', () => {
  beforeEach(() => {
    delete process.env['TURNSTILE_SECRET_KEY'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', NODE_ENV_ORIGINAL ?? 'test');
  });

  it('falla en cerrado en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(verifyTurnstile('token')).resolves.toEqual({
      ok: false,
      reason: 'verify_failed',
    });
  });

  it('permite pasar en desarrollo local', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await expect(verifyTurnstile('token')).resolves.toEqual({ ok: true });
  });
});
