import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'socket.io';
import { logger } from './logger';

const EMIT_SECRET = process.env['SOCKET_EMIT_SECRET'];

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
      try {
        const { channel, tenantId, event } = JSON.parse(body) as {
          channel: string;
          tenantId: string;
          event: unknown;
        };

        if (!channel || !tenantId || !event) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'BAD_REQUEST' }));
          return;
        }

        const room = `${tenantId}:${channel}`;
        io.to(room).emit('event', event);
        logger.info({ event: 'emit_broadcast', room, type: (event as { type?: string }).type });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'INVALID_JSON' }));
      }
    });
  };
}
