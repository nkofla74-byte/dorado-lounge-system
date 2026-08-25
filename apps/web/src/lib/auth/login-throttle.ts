import { headers } from 'next/headers';
import { rateLimit } from '@/lib/rate-limit';

// El bucket de login por IP (5 intentos / 15 min) vivía dentro de
// verifyTurnstile. Al delegar la verificación del CAPTCHA en Supabase Auth
// (ver login/actions.ts) el login ya no llama a verifyTurnstile, así que el
// bucket tenía que dejar de depender de ella: es la defensa que encarece la
// fuerza bruta y debe consumirse en todo intento, con token o sin él.

export async function ipDelSolicitante(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
}

/** Consume un intento del bucket de login. `false` = límite agotado. */
export async function consumirIntentoDeLogin(): Promise<boolean> {
  const rl = await rateLimit('login', await ipDelSolicitante());
  return rl.allowed;
}
