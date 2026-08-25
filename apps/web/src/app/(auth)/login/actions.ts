'use server';

import { createClient } from '@/lib/supabase/server';
import { consumirIntentoDeLogin } from '@/lib/auth/login-throttle';
import { getSafeNext } from '@/lib/auth/role-home';
import { ok, err, toAppError, AppError } from '@/lib/result';
import type { Result } from '@/lib/result';

// F-012 — El login ocurría en el navegador: la página llamaba a verifyTurnstile
// y, si pasaba, invocaba supabase.auth.signInWithPassword() desde el cliente.
// Eran dos operaciones desacopladas, así que nada obligaba a que la segunda
// fuese precedida de la primera: bastaba un POST directo al endpoint de Supabase
// Auth con la anon key pública para saltarse Turnstile y el bucket de 5
// intentos/15 min por completo.
//
// Aquí la autenticación ocurre en el servidor, de modo que el bucket se consume
// siempre que alguien intenta entrar por la aplicación. La cookie de sesión la
// escribe el cliente de servidor.
//
// RIESGO RESIDUAL CERRADO (2026-08-22): el endpoint de Supabase Auth es público
// por diseño, así que ninguna verificación hecha aquí podía impedir que alguien
// lo llamara directamente. La defensa completa es la protección CAPTCHA nativa
// de Supabase Auth, que aplica la verificación en el propio endpoint y ya está
// activada en el proyecto. Por eso este código NO valida el token contra
// Cloudflare: lo reenvía a Supabase en `options.captchaToken`.
//
// Un token de Turnstile es de un solo uso (Cloudflare responde
// `timeout-or-duplicate` a la segunda validación). Validarlo aquí y reenviarlo
// después haría que Supabase lo rechazara siempre: el login quedaría roto. Hay
// un único verificador y es el que emite la sesión.
//
// Requisito de configuración: Dashboard → Authentication → Settings → Enable
// Captcha protection, proveedor Cloudflare Turnstile, con el mismo
// TURNSTILE_SECRET_KEY que corresponde a NEXT_PUBLIC_TURNSTILE_SITE_KEY.
// Ver docs/remediacion/SECURITY_CHANGES.md.

export interface CredencialesLogin {
  email: string;
  password: string;
  turnstileToken?: string | undefined;
  next?: string | null | undefined;
}

export interface SesionIniciada {
  destino: string;
}

interface ErrorDeAuth {
  code?: string | undefined;
  status?: number | undefined;
}

export async function iniciarSesion(input: CredencialesLogin): Promise<Result<SesionIniciada>> {
  try {
    const email = input.email.trim();
    const password = input.password.trim();

    if (!email || !password) {
      return err(new AppError('VALIDATION', 400, 'Email y contraseña son obligatorios'));
    }

    const siteKeyConfigurada = !!process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'];
    if (siteKeyConfigurada && !input.turnstileToken) {
      return err(new AppError('TURNSTILE_REQUERIDO', 400, 'Verificación anti-bot requerida'));
    }

    // Se consume el bucket en todo intento que llegue hasta aquí, acierte o
    // falle: es lo que hace costoso el intento por fuerza bruta. El bucket es
    // por IP + cuenta, así que dos operarios distintos de la misma sala no se
    // agotan el cupo el uno al otro (ver login-throttle.ts).
    if (!(await consumirIntentoDeLogin(email))) {
      return err(new AppError('RATE_LIMITED', 429, 'Demasiados intentos. Espera unos minutos.'));
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      ...(input.turnstileToken ? { options: { captchaToken: input.turnstileToken } } : {}),
    });

    if (error) {
      const { code, status } = error as ErrorDeAuth;
      if (code === 'captcha_failed') {
        return err(new AppError('TURNSTILE_INVALIDO', 400, 'Verificación anti-bot inválida'));
      }
      if (code === 'over_request_rate_limit' || status === 429) {
        return err(new AppError('RATE_LIMITED', 429, 'Demasiados intentos. Espera unos minutos.'));
      }
    }

    // Mensaje genérico a propósito: distinguir "usuario no existe" de
    // "contraseña incorrecta" permite enumerar cuentas. Una cuenta baneada
    // (toggleUser en superuser) cae también aquí, y así debe ser.
    if (error || !data.user) {
      return err(new AppError('CREDENCIALES_INVALIDAS', 401, 'Credenciales inválidas'));
    }

    const role = data.user.app_metadata?.['role'] as string | undefined;
    const tenantId = data.user.app_metadata?.['tenant_id'] as string | undefined;

    if (!role || !tenantId) {
      await supabase.auth.signOut();
      return err(new AppError('SESION_SIN_CLAIMS', 401, 'Tu cuenta no tiene rol o sala asignados'));
    }

    return ok({ destino: getSafeNext(input.next, role) });
  } catch (e) {
    return err(toAppError(e));
  }
}
