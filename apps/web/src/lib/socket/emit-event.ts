import 'server-only';
import type { Channel, SocketEvent } from '@dorado/shared-types';

const SOCKET_URL = process.env['NEXT_PUBLIC_SOCKET_URL'] ?? 'http://localhost:3001';
const EMIT_SECRET = process.env['SOCKET_EMIT_SECRET'] ?? '';

// Llama al endpoint POST /emit del socket-server para hacer broadcast después
// de que el evento ya fue persistido en DB. Falla silenciosa: si el broadcast
// no llega, el evento sigue disponible en DB para reconciliación.
export async function emitEvent(
  tenantId: string,
  channel: Channel,
  event: SocketEvent,
): Promise<void> {
  if (!EMIT_SECRET) return;

  try {
    await fetch(`${SOCKET_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EMIT_SECRET}`,
      },
      body: JSON.stringify({ channel, tenantId, event }),
    });
  } catch {
    // Broadcast no crítico — la operación ya se persistió en DB
  }
}
