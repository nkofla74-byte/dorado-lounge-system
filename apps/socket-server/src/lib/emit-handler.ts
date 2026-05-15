import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'socket.io';
import { logger } from './logger';

const EMIT_SECRET = process.env['SOCKET_EMIT_SECRET'];

// Sliding-window rate limiter: máximo 120 peticiones por IP en 60 segundos.
// Protege el endpoint /emit de abuso (DoS, spam de eventos).
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const buckets = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS) {
    buckets.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  buckets.set(ip, timestamps);
  return false;
}

// Purgar entradas vacías cada 5 minutos para evitar crecimiento indefinido del Map
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of buckets) {
    if (timestamps.every((t) => now - t >= WINDOW_MS)) buckets.delete(ip);
  }
}, 5 * 60_000);

export function createEmitHandler(io: Server) {
  return function handleEmit(req: IncomingMessage, res: ServerResponse): void {
    if (!EMIT_SECRET) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SERVER_MISCONFIGURED' }));
      return;
    }

    const ip = req.socket.remoteAddress ?? 'unknown';
    if (isRateLimited(ip)) {
      logger.warn({ event: 'emit_rate_limited', ip });
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'RATE_LIMITED' }));
      return;
    }

    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${EMIT_SECRET}`) {
      logger.warn({ event: 'emit_unauthorized', ip });
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
