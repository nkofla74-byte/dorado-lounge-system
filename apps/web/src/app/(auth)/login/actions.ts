'use server';

import { createClient } from '@/lib/supabase/server';
import { verifyTurnstile } from '@/lib/turnstile/verify';
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
// Aquí la verificación y la autenticación ocurren en el mismo paso del servidor,
// de modo que el bucket se consume siempre que alguien intenta entrar por la
// aplicación. La cookie de sesión la escribe el cliente de servidor.
//
// RIESGO RESIDUAL: esto no puede impedir que alguien llame directamente al
// endpoint de Supabase Auth, que es público por diseño. La única defensa
// completa es activar la protección CAPTCHA nativa de Supabase Auth
// (Dashboard → Authentication → Settings → Enable Captcha protection), que
// aplica la verificación en el propio endpoint. Ver SECURITY_CHANGES.md.

export interface CredencialesLogin {
  email: string;
  password: string;
  turnstileToken?: string | undefined;
  next?: string | null | undefined;
}

export interface SesionIniciada {
  destino: string;
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

    // Consume el bucket de rate limit por IP aunque el token falte o sea
    // inválido: es lo que hace costoso el intento por fuerza bruta.
    const turnstile = await verifyTurnstile(input.turnstileToken ?? '');
    if (!turnstile.ok) {
      return turnstile.reason === 'rate_limited'
        ? err(new AppError('RATE_LIMITED', 429, 'Demasiados intentos. Espera unos minutos.'))
        : err(new AppError('TURNSTILE_INVALIDO', 400, 'Verificación anti-bot inválida'));
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Mensaje genérico a propósito: distinguir "usuario no existe" de
    // "contraseña incorrecta" permite enumerar cuentas.
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
