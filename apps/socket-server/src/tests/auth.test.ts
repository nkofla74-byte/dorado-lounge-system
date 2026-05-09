import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateHandshake, canJoinChannel } from '../lib/auth';

const TEST_SECRET = 'test-jwt-secret';

function makeSocket(token?: string) {
  return {
    id: 'socket-test-id',
    handshake: { auth: token !== undefined ? { token } : {} },
    data: {} as Record<string, unknown>,
  };
}

describe('authenticateHandshake', () => {
  beforeEach(() => {
    process.env['SUPABASE_JWT_SECRET'] = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env['SUPABASE_JWT_SECRET'];
  });

  it('rechaza cuando no se provee token', () => {
    const socket = makeSocket();
    const next = vi.fn();
    authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'UNAUTHENTICATED' }));
  });

  it('rechaza token inválido', () => {
    const socket = makeSocket('token-invalido');
    const next = vi.fn();
    authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_TOKEN' }));
  });

  it('rechaza JWT sin app_metadata', () => {
    const token = jwt.sign({ sub: 'user-1' }, TEST_SECRET);
    const socket = makeSocket(token);
    const next = vi.fn();
    authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_CLAIMS' }));
  });

  it('rechaza JWT sin tenant_id en app_metadata', () => {
    const token = jwt.sign({ sub: 'user-1', app_metadata: { role: 'chef' } }, TEST_SECRET);
    const socket = makeSocket(token);
    const next = vi.fn();
    authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_CLAIMS' }));
  });

  it('acepta JWT válido con claims correctos', () => {
    const token = jwt.sign(
      { sub: 'user-123', app_metadata: { tenant_id: 'tenant-456', role: 'chef' } },
      TEST_SECRET,
    );
    const socket = makeSocket(token);
    const next = vi.fn();
    authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(); // sin error
    expect(socket.data).toMatchObject({ userId: 'user-123', tenantId: 'tenant-456', role: 'chef' });
  });

  it('falla si falta SUPABASE_JWT_SECRET', () => {
    delete process.env['SUPABASE_JWT_SECRET'];
    const socket = makeSocket('any-token');
    const next = vi.fn();
    authenticateHandshake(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'SERVER_MISCONFIGURED' }));
  });
});

describe('canJoinChannel', () => {
  function makeSocketWithRole(role: string) {
    return { data: { role, tenantId: 'tenant-1', userId: 'user-1' } };
  }

  it('permite a chef unirse a sala:cocina', () => {
    expect(canJoinChannel(makeSocketWithRole('chef') as never, 'sala:cocina')).toBe(true);
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

  it('deniega a chef acceder a sala:amex', () => {
    expect(canJoinChannel(makeSocketWithRole('chef') as never, 'sala:amex')).toBe(false);
  });

  it('permite a personal_snack unirse a sala:snack', () => {
    expect(canJoinChannel(makeSocketWithRole('personal_snack') as never, 'sala:snack')).toBe(true);
  });

  it('permite a admin unirse a cualquier canal', () => {
    const channels = ['sala:cocina', 'sala:amex', 'sala:snack', 'sala:buffet', 'sala:admin'];
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

  it('permite a chef emitir a sala:stuart:amex', () => {
    expect(canJoinChannel(makeSocketWithRole('chef') as never, 'sala:stuart:amex')).toBe(true);
  });

  it('deniega a personal_snack en sala:stuart:buffet', () => {
    expect(
      canJoinChannel(makeSocketWithRole('personal_snack') as never, 'sala:stuart:buffet'),
    ).toBe(false);
  });
});
