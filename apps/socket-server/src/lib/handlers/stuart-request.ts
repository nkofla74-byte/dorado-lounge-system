import { z } from 'zod';
import type { Socket, Server } from 'socket.io';
import type { StuartRequestEvent, ZonaServicio } from '@dorado/shared-types';
import { CHANNELS } from '@dorado/shared-types';
import type { SocketData } from '../auth';
import { getSupabaseAdmin } from '../supabase';
import { persistDomainEvent } from '../persist-domain-event';
import { logger } from '../logger';

const payloadSchema = z.object({
  zona: z.enum(['amex', 'snack', 'buffet']),
  descripcion: z.string().min(1).max(500),
});

const STUART_CHANNEL: Record<ZonaServicio, string> = {
  amex: CHANNELS.STUART_AMEX,
  snack: CHANNELS.STUART_SNACK,
  buffet: CHANNELS.STUART_BUFFET,
};

export function registerStuartRequestHandler(socket: Socket, io: Server): void {
  socket.on('STUART_REQUEST', async (rawPayload: unknown) => {
    const { userId, tenantId } = socket.data as SocketData;

    const parsed = payloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', event: 'STUART_REQUEST' });
      return;
    }

    const { zona, descripcion } = parsed.data;
    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();

    // 1. Persistir domain_event antes del broadcast
    await persistDomainEvent(supabase, {
      tenantId,
      aggregateId: tenantId,
      aggregateType: 'stuart_request',
      eventType: 'STUART_REQUEST',
      payload: { zona, descripcion },
      createdBy: userId,
    });

    // 2. Broadcast al canal Stuart de la zona Y a cocina (nodo central)
    const event: StuartRequestEvent = {
      type: 'STUART_REQUEST',
      payload: { tenantId, zona, solicitanteId: userId, descripcion, createdAt: now },
    };

    const stuartRoom = `${tenantId}:${STUART_CHANNEL[zona]}`;
    const cocinaRoom = `${tenantId}:${CHANNELS.COCINA}`;

    io.to(stuartRoom).to(cocinaRoom).emit('event', event);
    logger.info({ event: 'stuart_request_broadcast', zona, stuartRoom, userId });
  });
}
