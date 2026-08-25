import 'server-only';
import type { Channel, SocketEvent } from '@dorado/shared-types';

const SOCKET_URL = process.env['NEXT_PUBLIC_SOCKET_URL'] ?? 'http://localhost:3001';
const EMIT_SECRET = process.env['SOCKET_EMIT_SECRET'] ?? '';

// Tiempo máximo que una Server Action espera al socket-server. El broadcast se
// declara best-effort, pero sin timeout un socket-server lento no falla: cuelga,
// y con él la operación que lo espera (F-015).
const EMIT_TIMEOUT_MS = 1500;

// Llama al endpoint POST /emit del socket-server para hacer broadcast después
// de que el evento ya fue persistido en DB. Falla silenciosa: si el broadcast
// no llega, el evento sigue disponible en DB para reconciliación.
export async function emitEvent(
  tenantId: string,
  channel: Channel,
  event: SocketEvent,
): Promise<void> {
  if (!EMIT_SECRET) {
    if (process.env['NODE_ENV'] === 'production') {
      console.warn('[emit-event] SOCKET_EMIT_SECRET not set — all real-time events suppressed');
    }
    return;
  }

  try {
    await fetch(`${SOCKET_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EMIT_SECRET}`,
      },
      body: JSON.stringify({ channel, tenantId, event }),
      signal: AbortSignal.timeout(EMIT_TIMEOUT_MS),
    });
  } catch {
    // Broadcast no crítico — la operación ya se persistió en DB
  }
}

/**
 * Difunde el mismo evento a varios canales en paralelo.
 *
 * Las Server Actions encadenaban hasta tres `await emitEvent` secuenciales, así
 * que la latencia del socket-server se multiplicaba por el número de canales.
 */
export async function emitEventoMulticanal(
  tenantId: string,
  channels: readonly Channel[],
  event: SocketEvent,
): Promise<void> {
  await Promise.allSettled(channels.map((channel) => emitEvent(tenantId, channel, event)));
}
