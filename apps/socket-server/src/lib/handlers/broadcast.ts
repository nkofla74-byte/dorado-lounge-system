import { z } from 'zod';
import type { Socket, Server } from 'socket.io';
import type { BroadcastEvent, UserRole } from '@dorado/shared-types';
import type { SocketData } from '../auth';
import { getSupabaseAdmin } from '../supabase';
import { persistDomainEvent } from '../persist-domain-event';
import { logger } from '../logger';

const payloadSchema = z.object({
  canal: z.enum(['sala:broadcast:cocina', 'sala:broadcast:admin']),
  contenido: z.string().min(1).max(2000),
});

const BROADCAST_ROLES: Record<'sala:broadcast:cocina' | 'sala:broadcast:admin', UserRole[]> = {
  'sala:broadcast:cocina': ['chef', 'sous_chef', 'admin', 'superuser'],
  'sala:broadcast:admin': ['admin', 'superuser'],
};

export function registerBroadcastHandler(socket: Socket, io: Server): void {
  socket.on('BROADCAST', async (rawPayload: unknown) => {
    const { userId, tenantId, role } = socket.data as SocketData;

    const parsed = payloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit('error', { code: 'INVALID_PAYLOAD', event: 'BROADCAST' });
      return;
    }

    const { canal, contenido } = parsed.data;
    const allowedRoles = BROADCAST_ROLES[canal];

    if (!allowedRoles.includes(role)) {
      logger.warn({ event: 'broadcast_acl_violation', socketId: socket.id, userId, canal, role });
      socket.emit('error', { code: 'FORBIDDEN', event: 'BROADCAST' });
      return;
    }

    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();

    // 1. Persistir domain_event antes del broadcast
    await persistDomainEvent(supabase, {
      tenantId,
      aggregateId: tenantId,
      aggregateType: 'broadcast',
      eventType: 'BROADCAST',
      payload: { canal, contenido },
      createdBy: userId,
    });

    // 2. Broadcast
    const event: BroadcastEvent = {
      type: 'BROADCAST',
      payload: { tenantId, canal, contenido, emisorId: userId, createdAt: now },
    };

    io.to(`${tenantId}:${canal}`).emit('event', event);
    logger.info({ event: 'broadcast_sent', canal, userId });
  });
}
