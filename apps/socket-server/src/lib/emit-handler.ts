import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'socket.io';
import { z } from 'zod';
import { CHANNELS } from '@dorado/shared-types';
import type { SocketEvent } from '@dorado/shared-types';
import { getSupabaseAdmin } from './supabase';
import { persistDomainEvent } from './persist-domain-event';
import { logger } from './logger';

const EMIT_SECRET = process.env['SOCKET_EMIT_SECRET'];

// Canales adicionales a notificar según tipo de evento (además del canal principal)
const EXTRA_CHANNELS: Partial<Record<SocketEvent['type'], string[]>> = {
  STOCK_OUT: [CHANNELS.ADMIN],
  DESPACHO: [CHANNELS.COCINA],
  TURNO_EVENTO: [CHANNELS.ADMIN],
};

const emitRequestSchema = z.object({
  channel: z.string().min(1),
  tenantId: z.string().uuid(),
  event: z.object({
    type: z.string().min(1),
    payload: z.record(z.unknown()),
  }),
});

function extractAggregateInfo(event: { type: string; payload: Record<string, unknown> }): {
  aggregateId: string;
  aggregateType: string;
  createdBy: string | null;
} {
  const p = event.payload;
  switch (event.type) {
    case 'PEDIDO_CREADO':
      return {
        aggregateId: (p['pedidoId'] as string | undefined) ?? (p['tenantId'] as string),
        aggregateType: 'pedido',
        createdBy: (p['creadoPor'] as string | undefined) ?? null,
      };
    case 'PEDIDO_ESTADO':
      return {
        aggregateId: (p['pedidoId'] as string | undefined) ?? (p['tenantId'] as string),
        aggregateType: 'pedido',
        createdBy: null,
      };
    case 'STOCK_OUT':
      return {
        aggregateId: (p['insumoId'] as string | undefined) ?? (p['tenantId'] as string),
        aggregateType: 'insumo',
        createdBy: (p['reportadoPor'] as string | undefined) ?? null,
      };
    case 'DESPACHO':
      return {
        aggregateId: (p['despachoId'] as string | undefined) ?? (p['tenantId'] as string),
        aggregateType: 'despacho',
        createdBy: (p['despachoPor'] as string | undefined) ?? null,
      };
    case 'TURNO_EVENTO':
      return {
        aggregateId: (p['turnoId'] as string | undefined) ?? (p['tenantId'] as string),
        aggregateType: 'turno',
        createdBy: (p['responsableId'] as string | undefined) ?? null,
      };
    default:
      return {
        aggregateId: (p['tenantId'] as string | undefined) ?? 'unknown',
        aggregateType: event.type.toLowerCase(),
        createdBy: null,
      };
  }
}

export function createEmitHandler(io: Server) {
  return function handleEmit(req: IncomingMessage, res: ServerResponse): void {
    if (!EMIT_SECRET) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SERVER_MISCONFIGURED' }));
      return;
    }

    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${EMIT_SECRET}`) {
      logger.warn({ event: 'emit_unauthorized', ip: req.socket.remoteAddress });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      void (async () => {
        try {
          const parsed = emitRequestSchema.safeParse(JSON.parse(body) as unknown);
          if (!parsed.success) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'BAD_REQUEST', details: parsed.error.issues }));
            return;
          }

          const { channel, tenantId, event } = parsed.data;
          const primaryRoom = `${tenantId}:${channel}`;

          // 1. Persistir domain_event antes del broadcast
          const aggregate = extractAggregateInfo(event);
          try {
            const supabase = getSupabaseAdmin();
            await persistDomainEvent(supabase, {
              tenantId,
              aggregateId: aggregate.aggregateId,
              aggregateType: aggregate.aggregateType,
              eventType: event.type,
              payload: event.payload,
              createdBy: aggregate.createdBy,
            });
          } catch (e) {
            // No bloqueamos el broadcast si Supabase no está disponible
            logger.error({ event: 'supabase_unavailable', error: (e as Error).message });
          }

          // 2. Broadcast al canal primario
          io.to(primaryRoom).emit('event', event);

          // 3. Broadcast a canales adicionales según tipo de evento
          const extraChannels = EXTRA_CHANNELS[event.type as SocketEvent['type']];
          if (extraChannels) {
            for (const extraChannel of extraChannels) {
              const extraRoom = `${tenantId}:${extraChannel}`;
              if (extraRoom !== primaryRoom) {
                io.to(extraRoom).emit('event', event);
              }
            }
          }

          logger.info({ event: 'emit_broadcast', room: primaryRoom, type: event.type });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_JSON' }));
        }
      })();
    });
  };
}
