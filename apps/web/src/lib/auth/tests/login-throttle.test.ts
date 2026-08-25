import { describe, it, expect, vi, beforeEach } from 'vitest';

// El bucket de login se llaveaba solo por IP. Todo el personal de una sala sale
// por la misma conexión, así que compartían un cupo de 5 intentos cada 15
// minutos y se bloqueaban entre ellos en un cambio de turno, con la contraseña
// correcta. Estas pruebas fijan la clave compuesta que lo corrige.

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  cabeceras: new Map<string, string>(),
}));

vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => mocks.cabeceras.get(k) ?? null }),
}));

import { consumirIntentoDeLogin } from '@/lib/auth/login-throttle';

/** Devuelve el identificador con el que se llamó al bucket `login`. */
const claveUsada = () => mocks.rateLimit.mock.calls.at(-1)?.[1] as string;

describe('consumirIntentoDeLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cabeceras.clear();
    mocks.cabeceras.set('x-forwarded-for', '190.0.0.7');
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 4, reset: 0 });
  });

  it('separa el cupo por cuenta, no solo por IP', async () => {
    await consumirIntentoDeLogin('chef@dorado.test');
    const claveChef = claveUsada();

    await consumirIntentoDeLogin('almacen@dorado.test');
    const claveAlmacen = claveUsada();

    // Dos operarios de la misma sala, misma IP: no pueden compartir bucket.
    expect(claveChef).not.toBe(claveAlmacen);
    expect(claveChef).toContain('chef@dorado.test');
    expect(claveAlmacen).toContain('almacen@dorado.test');
  });

  it('mantiene un solo cupo para la misma cuenta desde la misma IP', async () => {
    await consumirIntentoDeLogin('chef@dorado.test');
    const primera = claveUsada();

    await consumirIntentoDeLogin('chef@dorado.test');
    expect(claveUsada()).toBe(primera);
  });

  it('normaliza el correo: alternar mayúsculas no estrena bucket', async () => {
    // Sin esto bastaría variar el caso en cada intento para saltarse el límite,
    // porque Supabase trata el correo sin distinguir mayúsculas.
    await consumirIntentoDeLogin('Chef@Dorado.test');
    const conMayusculas = claveUsada();

    await consumirIntentoDeLogin('  chef@dorado.test  ');
    expect(claveUsada()).toBe(conMayusculas);
  });

  it('distingue la IP para una misma cuenta', async () => {
    await consumirIntentoDeLogin('chef@dorado.test');
    const desdeLaSala = claveUsada();

    mocks.cabeceras.set('x-forwarded-for', '203.0.113.9');
    await consumirIntentoDeLogin('chef@dorado.test');

    expect(claveUsada()).not.toBe(desdeLaSala);
  });

  it('propaga el veredicto del bucket', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, reset: 0 });
    await expect(consumirIntentoDeLogin('chef@dorado.test')).resolves.toBe(false);
  });
});
