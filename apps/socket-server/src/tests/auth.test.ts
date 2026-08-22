import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock de jose: la verificación asimétrica (ES256 vía JWKS) se prueba a nivel de
// wiring del branch; la verificación criptográfica real se cubre end-to-end
// contra el socket-server corriendo. El path HS256 usa jsonwebtoken (sin mock).
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'jwks-resolver'),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from 'jose';
import {
  authenticateHandshake,
  canJoinChannel,
  msHastaExpiracion,
  __resetJwksCache,
} from '../lib/auth';

const TEST_SECRET = 'test-jwt-secret';

function makeSocket(token?: string) {
  return {
    id: 'socket-test-id',
    handshake: { auth: token !== undefined ? { token } : {} },
    data: {} as Record<string, unknown>,
  };
}

// Construye un JWT no-firmado con header arbitrario (jwt.decode lee el header
// sin verificar). Sirve para forzar el branch asimétrico.
function fakeJwt(alg: string, payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg, typ: 'JWT' })}.${b64(payload)}.sig`;
}

describe('authenticateHandshake', () => {
  beforeEach(() => {
    process.env['SUPABASE_JWT_SECRET'] = TEST_SECRET;
    process.env['SUPABASE_URL'] = 'https://test.supabase.co';
    // La verificación HS256 legacy es opt-in desde F-030.
    process.env['ALLOW_LEGACY_HS256'] = 'true';
    __resetJwksCache();
    (jwtVerify as Mock).mockReset();
  });

  afterEach(() => {
    delete process.env['SUPABASE_JWT_SECRET'];
    delete process.env['SUPABASE_URL'];
    delete process.env['ALLOW_LEGACY_HS256'];
  });

  it('rechaza HS256 si la verificación legacy no está habilitada', async () => {
    delete process.env['ALLOW_LEGACY_HS256'];
    const token = jwt.sign(
      { sub: 'u', app_metadata: { tenant_id: 't', role: 'admin' } },
      TEST_SECRET,
    );
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_TOKEN' }));
  });

  it('rechaza cuando no se provee token', async () => {
    const socket = makeSocket();
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'UNAUTHENTICATED' }));
  });

  it('rechaza token inválido (no decodificable)', async () => {
    const socket = makeSocket('token-invalido');
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_TOKEN' }));
  });

  it('rechaza JWT HS256 sin app_metadata', async () => {
    const token = jwt.sign({ sub: 'user-1' }, TEST_SECRET);
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_CLAIMS' }));
  });

  it('rechaza JWT HS256 sin tenant_id en app_metadata', async () => {
    const token = jwt.sign(
      { sub: 'user-1', app_metadata: { role: 'chef_cocina_fria' } },
      TEST_SECRET,
    );
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_CLAIMS' }));
  });

  it('acepta JWT HS256 (legacy) con claims correctos cuando está habilitado', async () => {
    const token = jwt.sign(
      { sub: 'user-123', app_metadata: { tenant_id: 'tenant-456', role: 'chef_cocina_fria' } },
      TEST_SECRET,
    );
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(); // sin error
    expect(socket.data).toMatchObject({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'chef_cocina_fria',
    });
  });

  it('acepta token asimétrico (ES256) verificado vía JWKS', async () => {
    (jwtVerify as Mock).mockResolvedValue({
      payload: { sub: 'user-es256', app_metadata: { tenant_id: 'tenant-9', role: 'admin' } },
    });
    const token = fakeJwt('ES256', { sub: 'user-es256' });
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(jwtVerify).toHaveBeenCalledWith(token, 'jwks-resolver', {
      algorithms: ['ES256', 'RS256'],
    });
    expect(next).toHaveBeenCalledWith(); // sin error
    expect(socket.data).toMatchObject({
      userId: 'user-es256',
      tenantId: 'tenant-9',
      role: 'admin',
    });
  });

  it('rechaza token asimétrico con firma inválida', async () => {
    (jwtVerify as Mock).mockRejectedValue(new Error('signature verification failed'));
    const token = fakeJwt('ES256', { sub: 'x' });
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_TOKEN' }));
  });

  it('falla con HS256 si falta SUPABASE_JWT_SECRET', async () => {
    delete process.env['SUPABASE_JWT_SECRET'];
    const token = jwt.sign(
      { sub: 'u', app_metadata: { tenant_id: 't', role: 'chef_cocina_fria' } },
      TEST_SECRET,
    );
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'SERVER_MISCONFIGURED' }));
  });

  it('falla con token asimétrico si falta SUPABASE_URL (sin JWKS)', async () => {
    delete process.env['SUPABASE_URL'];
    __resetJwksCache();
    const token = fakeJwt('ES256', { sub: 'x' });
    const socket = makeSocket(token);
    const next = vi.fn();
    await authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'SERVER_MISCONFIGURED' }));
  });
});

describe('canJoinChannel', () => {
  function makeSocketWithRole(role: string) {
    return { data: { role, tenantId: 'tenant-1', userId: 'user-1' } };
  }

  it('permite a chef_cocina_fria unirse a sala:cocina', () => {
    expect(canJoinChannel(makeSocketWithRole('chef_cocina_fria') as never, 'sala:cocina')).toBe(
      true,
    );
  });

  it('permite a sous_chef unirse a sala:cocina', () => {
    expect(canJoinChannel(makeSocketWithRole('sous_chef') as never, 'sala:cocina')).toBe(true);
  });

  it('deniega a mesero_amex acceder a sala:cocina', () => {
    expect(canJoinChannel(makeSocketWithRole('mesero_amex') as never, 'sala:cocina')).toBe(false);
  });

  it('permite a mesero_amex unirse a sala:amex', () => {
    expect(canJoinChannel(makeSocketWithRole('mesero_amex') as never, 'sala:amex')).toBe(true);
  });

  it('deniega a chef_cocina_fria acceder a sala:amex', () => {
    expect(canJoinChannel(makeSocketWithRole('chef_cocina_fria') as never, 'sala:amex')).toBe(
      false,
    );
  });

  it('permite a admin unirse a cualquier canal', () => {
    const channels = ['sala:cocina', 'sala:amex', 'sala:admin'];
    for (const ch of channels) {
      expect(canJoinChannel(makeSocketWithRole('admin') as never, ch)).toBe(true);
    }
  });

  it('deniega canal desconocido', () => {
    expect(canJoinChannel(makeSocketWithRole('admin') as never, 'sala:inexistente')).toBe(false);
  });

  it('deniega si socket.data es undefined', () => {
    expect(canJoinChannel({ data: undefined } as never, 'sala:cocina')).toBe(false);
  });

  it('deniega a mesero_amex en sala:cocina', () => {
    expect(canJoinChannel(makeSocketWithRole('mesero_amex') as never, 'sala:cocina')).toBe(false);
  });
});

describe('msHastaExpiracion', () => {
  it('devuelve el tiempo restante del token', () => {
    const ahora = 1_800_000_000_000;
    const socket = { data: { expiraEn: ahora / 1000 + 60, role: 'admin' } };
    expect(msHastaExpiracion(socket as never, ahora)).toBe(60_000);
  });

  it('devuelve un valor negativo si el token ya venció', () => {
    const ahora = 1_800_000_000_000;
    const socket = { data: { expiraEn: ahora / 1000 - 10, role: 'admin' } };
    expect(msHastaExpiracion(socket as never, ahora)).toBeLessThan(0);
  });

  it('devuelve null si el JWT no declara exp', () => {
    expect(msHastaExpiracion({ data: { expiraEn: null } } as never)).toBeNull();
  });

  it('devuelve null si el socket no tiene datos de sesión', () => {
    expect(msHastaExpiracion({ data: undefined } as never)).toBeNull();
  });
});

describe('authenticateHandshake — vencimiento', () => {
  it('guarda exp del token en socket.data para poder cerrar la conexión', async () => {
    process.env['SUPABASE_JWT_SECRET'] = TEST_SECRET;
    process.env['ALLOW_LEGACY_HS256'] = 'true';
    const token = jwt.sign(
      { sub: 'u', app_metadata: { tenant_id: 't', role: 'admin' } },
      TEST_SECRET,
      { expiresIn: '1h' },
    );
    const socket = makeSocket(token);
    await authenticateHandshake(socket as never, vi.fn());

    expect(typeof (socket.data as { expiraEn: number }).expiraEn).toBe('number');
  });
});
