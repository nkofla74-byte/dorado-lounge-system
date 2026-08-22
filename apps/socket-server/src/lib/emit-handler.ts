import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Server } from 'socket.io';
import { CHANNELS } from '@dorado/shared-types';
import { logger } from './logger';

const EMIT_SECRET = process.env['SOCKET_EMIT_SECRET'];
const VALID_CHANNELS = new Set<string>(Object.values(CHANNELS));
const MAX_BODY_BYTES = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sliding-window rate limiter del endpoint /emit.
//
// Antes se indexaba por `req.socket.remoteAddress`, que detrás del balanceador
// de Render es siempre la IP del proxy: todo el tráfico legítimo de Vercel caía
// en un único bucket de 120/min y, al superarlo, los eventos en tiempo real se
// perdían en silencio mientras los KDS dejaban de refrescarse (F-025).
//
// El endpoint ya está autenticado con un secreto compartido comparado en tiempo
// constante, así que el límite solo actúa como red de contención: se indexa por
// la IP reenviada cuando existe y el techo es acorde a una sala en hora punta.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 1200;
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

/** IP real del cliente detrás del proxy de Render; cae al socket si no hay cabecera. */
function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

function isAuthorized(auth: string | string[] | undefined): boolean {
  if (!EMIT_SECRET || typeof auth !== 'string') return false;

  const expected = Buffer.from(`Bearer ${EMIT_SECRET}`);
  const actual = Buffer.from(auth);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isValidEvent(event: unknown): event is { type: string; payload: unknown } {
  if (!event || typeof event !== 'object') return false;
  const maybeEvent = event as { type?: unknown; payload?: unknown };
  return typeof maybeEvent.type === 'string' && maybeEvent.payload !== undefined;
}

export function createEmitHandler(io: Server) {
  return function handleEmit(req: IncomingMessage, res: ServerResponse): void {
    if (!EMIT_SECRET) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SERVER_MISCONFIGURED' }));
      return;
    }

    const ip = clientIp(req);
    if (isRateLimited(ip)) {
      logger.warn({ event: 'emit_rate_limited', ip });
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'RATE_LIMITED' }));
      return;
    }

    const auth = req.headers['authorization'];
    if (!isAuthorized(auth)) {
      logger.warn({ event: 'emit_unauthorized', ip });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
      return;
    }

    let body = '';
    let bodyBytes = 0;
    req.on('data', (chunk: Buffer) => {
      bodyBytes += chunk.byteLength;
      if (bodyBytes > MAX_BODY_BYTES) {
        logger.warn({ event: 'emit_body_too_large', ip, bytes: bodyBytes });
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { channel, tenantId, event } = JSON.parse(body) as {
          channel: string;
          tenantId: string;
          event: unknown;
        };

        if (!UUID_RE.test(tenantId) || !VALID_CHANNELS.has(channel) || !isValidEvent(event)) {
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
