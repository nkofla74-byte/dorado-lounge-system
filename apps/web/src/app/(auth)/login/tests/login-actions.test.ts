import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regresión de F-012 y de su riesgo residual, cerrado el 2026-08-22 al activar
// la protección CAPTCHA nativa de Supabase Auth.
//
// El login validaba el token de Turnstile contra Cloudflare y luego llamaba a
// signInWithPassword sin reenviarlo. Con el CAPTCHA activado en Supabase eso
// rompe el login por partida doble: el token es de un solo uso (Cloudflare
// responde `timeout-or-duplicate` a la segunda validación) y Supabase nunca
// recibía ninguno. Ahora hay un único verificador —el endpoint que emite la
// sesión— y el bucket de intentos se consume aquí, no dentro de verifyTurnstile.

const mocks = vi.hoisted(() => ({
  consumirIntentoDeLogin: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/lib/auth/login-throttle', () => ({
  consumirIntentoDeLogin: mocks.consumirIntentoDeLogin,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
  }),
}));

import { iniciarSesion } from '@/app/(auth)/login/actions';

const USUARIO = {
  id: 'u-1',
  app_metadata: { role: 'chef_cocina_fria', tenant_id: 't-1' },
};

const CREDENCIALES = {
  email: 'chef@dorado.test',
  password: 'contrasena-larga',
  turnstileToken: 'token-de-turnstile',
};

const espiarFetch = () => vi.spyOn(globalThis, 'fetch');

describe('iniciarSesion', () => {
  let fetchSpy: ReturnType<typeof espiarFetch>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumirIntentoDeLogin.mockResolvedValue(true);
    mocks.signInWithPassword.mockResolvedValue({ data: { user: USUARIO }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    fetchSpy = espiarFetch();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
  });

  it('reenvía el token de Turnstile a Supabase en options.captchaToken', async () => {
    const res = await iniciarSesion(CREDENCIALES);

    expect(res.ok).toBe(true);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: CREDENCIALES.email,
      password: CREDENCIALES.password,
      options: { captchaToken: 'token-de-turnstile' },
    });
  });

  it('no gasta el token validándolo contra Cloudflare antes de Supabase', async () => {
    // Con el secreto presente, el código anterior sí llamaba a siteverify: es
    // justo esa llamada la que invalidaba el token para Supabase.
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secreto');

    await iniciarSesion(CREDENCIALES);

    const llamadasACloudflare = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('challenges.cloudflare.com'),
    );
    expect(llamadasACloudflare).toHaveLength(0);
  });

  it('lleva al destino del rol', async () => {
    const res = await iniciarSesion(CREDENCIALES);

    expect(res.ok && res.value.destino).toBe('/cocina-fria');
  });

  it('traduce captcha_failed de Supabase a un error anti-bot, no a credenciales', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'captcha_failed', status: 400, message: 'captcha protection: failed' },
    });

    const res = await iniciarSesion(CREDENCIALES);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('TURNSTILE_INVALIDO');
  });

  it('traduce el rate limit de Supabase a 429', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'over_request_rate_limit', status: 429, message: 'too many requests' },
    });

    const res = await iniciarSesion(CREDENCIALES);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('RATE_LIMITED');
  });

  it('consume el bucket de intentos y corta antes de tocar Supabase si está agotado', async () => {
    mocks.consumirIntentoDeLogin.mockResolvedValue(false);

    const res = await iniciarSesion(CREDENCIALES);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('RATE_LIMITED');
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('acota el bucket a la cuenta que intenta entrar', async () => {
    // Sin el email el bucket vuelve a ser por IP a secas, y toda la sala
    // comparte un cupo de 5 intentos cada 15 min (ver login-throttle.ts).
    await iniciarSesion(CREDENCIALES);

    expect(mocks.consumirIntentoDeLogin).toHaveBeenCalledWith(CREDENCIALES.email);
  });

  it('exige el token cuando la site key está configurada', async () => {
    const res = await iniciarSesion({ ...CREDENCIALES, turnstileToken: undefined });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('TURNSTILE_REQUERIDO');
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('sin site key configurada no exige token ni lo envía a Supabase', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');

    const res = await iniciarSesion({ ...CREDENCIALES, turnstileToken: undefined });

    expect(res.ok).toBe(true);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: CREDENCIALES.email,
      password: CREDENCIALES.password,
    });
  });

  it('devuelve un mensaje genérico ante credenciales inválidas (no permite enumerar)', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    });

    const res = await iniciarSesion(CREDENCIALES);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('cierra la sesión si el usuario no tiene claims de rol o tenant', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u-1', app_metadata: {} } },
      error: null,
    });

    const res = await iniciarSesion(CREDENCIALES);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('SESION_SIN_CLAIMS');
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
