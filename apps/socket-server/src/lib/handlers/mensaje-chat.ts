import { z } from 'zod';
import type { Socket, Server } from 'socket.io';
import type { Channel, MensajeChatEvent } from '@dorado/shared-types';
import { CHANNELS } from '@dorado/shared-types';
import type { SocketData } from '../auth';
import { getSupabaseAdmin } from '../supabase';
import { persistDomainEvent } from '../persist-domain-event';
import { logger } from '../logger';

const VALID_CHANNELS = Object.values(CHANNELS) as string[];

const payloadSchema = z.object({
  contenido: z.string().min(1).max(2000),
  tipo: z.enum(['text', 'image', 'alert', 'broadcast']),
  canal: z.string().refine((v) => VALID_CHANNELS.includes(v), { message: 'Canal inválido' }),
  remitenteNombre: z.string().min(1).max(100),
});

export function registerMensajeChatHandler(socket: Socket, io: Server): void {
  socket.on('MENSAJE_CHAT', async (rawPayload: unknown) => {
    const { userId, tenantId } = socket.data as SocketData;

    const parsed = payloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', event: 'MENSAJE_CHAT' });
      logger.warn({ event: 'mensaje_chat_invalid_payload', socketId: socket.id, userId });
      return;
    }

    const { contenido, tipo, canal, remitenteNombre } = parsed.data;
    const supabase = getSupabaseAdmin();

    // 1. Persistir en mensajes_chat antes del broadcast
    const { data, error } = await supabase
      .from('mensajes_chat')
      .insert({ tenant_id: tenantId, canal, remitente_id: userId, contenido, tipo })
      .select('id, created_at')
      .single();

    if (error || !data) {
      logger.error({ event: 'mensaje_chat_persist_error', error: error?.message, userId });
      socket.emit('error', { code: 'PERSIST_FAILED', event: 'MENSAJE_CHAT' });
      return;
    }

    const mensajeId = (data as { id: string }).id;
    const createdAt = (data as { created_at: string }).created_at;

    // 2. Persistir domain_event
    await persistDomainEvent(supabase, {
      tenantId,
      aggregateId: mensajeId,
      aggregateType: 'mensaje_chat',
      eventType: 'MENSAJE_CHAT',
      payload: { canal, contenido, tipo, remitenteNombre },
      createdBy: userId,
    });

    // 3. Broadcast al canal correspondiente
    const event: MensajeChatEvent = {
      type: 'MENSAJE_CHAT',
      payload: {
        mensajeId,
        tenantId,
        canal: canal as Channel,
        remitenteId: userId,
        remitenteNombre,
        contenido,
        tipo,
        createdAt,
      },
    };

    io.to(`${tenantId}:${canal}`).emit('event', event);
    logger.info({ event: 'mensaje_chat_broadcast', canal, tipo, userId });
  });
}
