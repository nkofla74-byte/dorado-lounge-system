import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase antes de importar los handlers
vi.mock('../lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getSupabaseAdmin } from '../lib/supabase';
import { registerMensajeChatHandler } from '../lib/handlers/mensaje-chat';
import { registerBroadcastHandler } from '../lib/handlers/broadcast';
import { registerStuartRequestHandler } from '../lib/handlers/stuart-request';

function makeSupabaseMock(insertResult: { data?: unknown; error?: { message: string } | null }) {
  const singleMock = vi.fn().mockResolvedValue(insertResult);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const insertMock = vi.fn().mockReturnValue({ select: selectMock, single: singleMock });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock, from: vi.fn() });
  return { from: fromMock, _insertMock: insertMock, _singleMock: singleMock };
}

function makeSocketMock(role: string, userId = 'user-1', tenantId = 'tenant-abc') {
  const handlers: Record<string, (payload: unknown) => void | Promise<void>> = {};
  return {
    id: 'socket-id',
    data: { userId, tenantId, role },
    on: vi.fn((event: string, cb: (payload: unknown) => void) => {
      handlers[event] = cb;
    }),
    emit: vi.fn(),
    _trigger: async (event: string, payload: unknown) => {
      await handlers[event]?.(payload);
    },
  };
}

function makeIoMock() {
  const emitMock = vi.fn();
  const toMock = vi
    .fn()
    .mockReturnValue({ emit: emitMock, to: vi.fn().mockReturnValue({ emit: emitMock }) });
  return { to: toMock, _emitMock: emitMock };
}

// ── MENSAJE_CHAT ──────────────────────────────────────────────────────────────

describe('registerMensajeChatHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emite error si el payload es inválido', async () => {
    const supabase = makeSupabaseMock({ data: null, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('chef');
    const io = makeIoMock();
    registerMensajeChatHandler(socket as never, io as never);

    await socket._trigger('MENSAJE_CHAT', {
      contenido: '',
      tipo: 'text',
      canal: 'sala:cocina',
      remitenteNombre: 'Chef',
    });
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('emite error si falla la persistencia en DB', async () => {
    const supabase = makeSupabaseMock({ data: null, error: { message: 'DB error' } });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('chef');
    const io = makeIoMock();
    registerMensajeChatHandler(socket as never, io as never);

    await socket._trigger('MENSAJE_CHAT', {
      contenido: 'Hola cocina',
      tipo: 'text',
      canal: 'sala:cocina',
      remitenteNombre: 'Chef Carlos',
    });
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'PERSIST_FAILED' }),
    );
  });

  it('persiste y hace broadcast cuando el payload es válido', async () => {
    const supabase = makeSupabaseMock({
      data: { id: 'msg-uuid-1', created_at: '2026-05-09T10:00:00Z' },
      error: null,
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('chef', 'user-chef', 'tenant-x');
    const io = makeIoMock();
    registerMensajeChatHandler(socket as never, io as never);

    await socket._trigger('MENSAJE_CHAT', {
      contenido: 'Pandebonos listos',
      tipo: 'text',
      canal: 'sala:cocina',
      remitenteNombre: 'Chef Carlos',
    });

    expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    expect(io.to).toHaveBeenCalledWith('tenant-x:sala:cocina');
    expect(io._emitMock).toHaveBeenCalledWith(
      'event',
      expect.objectContaining({ type: 'MENSAJE_CHAT' }),
    );
  });

  it('rechaza canal inválido', async () => {
    const socket = makeSocketMock('chef');
    const io = makeIoMock();
    registerMensajeChatHandler(socket as never, io as never);

    await socket._trigger('MENSAJE_CHAT', {
      contenido: 'Hola',
      tipo: 'text',
      canal: 'sala:inexistente',
      remitenteNombre: 'Chef',
    });
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });
});

// ── BROADCAST ─────────────────────────────────────────────────────────────────

describe('registerBroadcastHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rechaza payload inválido', async () => {
    const socket = makeSocketMock('chef');
    const io = makeIoMock();
    registerBroadcastHandler(socket as never, io as never);

    await socket._trigger('BROADCAST', { canal: 'sala:broadcast:cocina' }); // falta contenido
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('rechaza mesero_amex en broadcast:cocina', async () => {
    const socket = makeSocketMock('mesero_amex');
    const io = makeIoMock();
    registerBroadcastHandler(socket as never, io as never);

    await socket._trigger('BROADCAST', { canal: 'sala:broadcast:cocina', contenido: 'Aviso' });
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('rechaza chef en broadcast:admin', async () => {
    const supabase = makeSupabaseMock({ data: null, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('chef');
    const io = makeIoMock();
    registerBroadcastHandler(socket as never, io as never);

    await socket._trigger('BROADCAST', { canal: 'sala:broadcast:admin', contenido: 'Aviso admin' });
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('chef puede emitir broadcast:cocina', async () => {
    const supabase = makeSupabaseMock({ data: { id: 'evt-1' }, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('chef', 'chef-user', 'tenant-y');
    const io = makeIoMock();
    registerBroadcastHandler(socket as never, io as never);

    await socket._trigger('BROADCAST', {
      canal: 'sala:broadcast:cocina',
      contenido: 'Atención cocina',
    });
    expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    expect(io.to).toHaveBeenCalledWith('tenant-y:sala:broadcast:cocina');
    expect(io._emitMock).toHaveBeenCalledWith(
      'event',
      expect.objectContaining({ type: 'BROADCAST' }),
    );
  });

  it('admin puede emitir broadcast:admin', async () => {
    const supabase = makeSupabaseMock({ data: { id: 'evt-2' }, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('admin', 'admin-user', 'tenant-z');
    const io = makeIoMock();
    registerBroadcastHandler(socket as never, io as never);

    await socket._trigger('BROADCAST', {
      canal: 'sala:broadcast:admin',
      contenido: 'Revisión inventario',
    });
    expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    expect(io.to).toHaveBeenCalledWith('tenant-z:sala:broadcast:admin');
  });
});

// ── STUART_REQUEST ────────────────────────────────────────────────────────────

describe('registerStuartRequestHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rechaza payload inválido', async () => {
    const socket = makeSocketMock('mesero_amex');
    const io = makeIoMock();
    registerStuartRequestHandler(socket as never, io as never);

    await socket._trigger('STUART_REQUEST', { zona: 'amex' }); // falta descripcion
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('emite a sala:stuart:amex y sala:cocina cuando zona es amex', async () => {
    const supabase = makeSupabaseMock({ data: { id: 'evt-3' }, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('mesero_amex', 'user-mes', 'tenant-q');
    const io = makeIoMock();
    registerStuartRequestHandler(socket as never, io as never);

    await socket._trigger('STUART_REQUEST', {
      zona: 'amex',
      descripcion: 'Necesito más cubiertos',
    });
    expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    // Debe broadcast a stuart:amex Y cocina
    expect(io.to).toHaveBeenCalledWith('tenant-q:sala:stuart:amex');
    expect(io._emitMock).toHaveBeenCalledWith(
      'event',
      expect.objectContaining({ type: 'STUART_REQUEST' }),
    );
  });

  it('enruta correctamente a sala:stuart:snack para zona snack', async () => {
    const supabase = makeSupabaseMock({ data: { id: 'evt-4' }, error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue(supabase as never);

    const socket = makeSocketMock('personal_snack', 'user-snk', 'tenant-r');
    const io = makeIoMock();
    registerStuartRequestHandler(socket as never, io as never);

    await socket._trigger('STUART_REQUEST', { zona: 'snack', descripcion: 'Reponer servilletas' });
    expect(io.to).toHaveBeenCalledWith('tenant-r:sala:stuart:snack');
  });
});
