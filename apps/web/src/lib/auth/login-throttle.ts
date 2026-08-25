import { headers } from 'next/headers';
import { rateLimit } from '@/lib/rate-limit';

// El bucket de login por IP (5 intentos / 15 min) vivía dentro de
// verifyTurnstile. Al delegar la verificación del CAPTCHA en Supabase Auth
// (ver login/actions.ts) el login ya no llama a verifyTurnstile, así que el
// bucket tenía que dejar de depender de ella: es la defensa que encarece la
// fuerza bruta y debe consumirse en todo intento, con token o sin él.
//
// 2026-08-25 — La clave era la IP a secas, y eso rompía la operación. Todo el
// personal de una sala sale a internet por la misma conexión, así que
// compartían UN cupo de 5 intentos cada 15 minutos: en un cambio de turno, con
// los cuatro KDS, meseros y almacén entrando a la vez, se bloqueaban entre
// ellos al sexto login aunque todos escribieran bien su contraseña.
//
// La clave pasa a ser IP + email. La fuerza bruta contra una cuenta sigue
// topada en 5 intentos por ventana —que es la amenaza real— y dos personas
// distintas dejan de estorbarse. Es además el patrón que ya usaban los otros
// buckets: `qrOrder` con `${tenant}:${mesa}:${ip}` y `gdpr` con `user.id`.
//
// Riesgo aceptado: quien pruebe MUCHAS cuentas distintas desde una IP
// (password spraying) gana intentos totales. Lo cubren las dos capas que ya
// existen en ese camino: el CAPTCHA nativo de Supabase Auth y el rate limit
// propio de Supabase, ambos en el endpoint que emite la sesión.

export async function ipDelSolicitante(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
}

/**
 * Consume un intento del bucket de login para esta IP y esta cuenta.
 * `false` = límite agotado.
 *
 * El email se normaliza a minúsculas a propósito: Supabase trata el correo sin
 * distinguir mayúsculas, así que sin normalizar bastaría alternar el caso
 * (`Chef@`, `cHef@`, …) para estrenar un bucket en cada intento y saltarse el
 * límite por completo.
 */
export async function consumirIntentoDeLogin(email: string): Promise<boolean> {
  const cuenta = email.trim().toLowerCase();
  const rl = await rateLimit('login', `${await ipDelSolicitante()}:${cuenta}`);
  return rl.allowed;
}
