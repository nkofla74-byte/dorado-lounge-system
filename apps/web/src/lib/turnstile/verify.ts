'use server';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_token' | 'verify_failed' };

// ATENCIÓN: un token de Turnstile es de un solo uso — Cloudflare devuelve
// `timeout-or-duplicate` en la segunda validación. Por eso el login NO usa esta
// función: con la protección CAPTCHA nativa de Supabase Auth activada, quien
// valida el token es el propio endpoint de Supabase. Esta función queda para el
// camino QR de pasajeros, donde Supabase Auth no interviene.
//
// ESTA FUNCIÓN NO LIMITA POR SÍ MISMA. Hasta el 2026-08-25 consumía el bucket
// `login`, y eso acoplaba dos caminos que no tienen nada que ver: los pasajeros
// escaneando el QR gastaban el cupo de acceso del personal, porque en una sala
// ambos salen por la misma IP. Un bucket propio tampoco procedía: el único
// llamador —`createPedidoFromQR`— ya limita justo antes con una clave mejor y
// más estricta (`qrOrder`, `${tenant}:${mesa}:${ip}`, 6/10 min), así que
// cualquier bucket añadido aquí no llegaría nunca a ser el límite que corta.
// Maquinaria de seguridad que no puede actuar es peor que ninguna: aparenta
// proteger.
//
// Quien añada un llamador nuevo debe limitarlo él, como hace createPedidoFromQR.
export async function verifyTurnstile(token: string): Promise<TurnstileResult> {
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
