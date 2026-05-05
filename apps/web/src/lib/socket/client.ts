import { io, type Socket } from 'socket.io-client';
import type { SocketEvent } from '@dorado/shared-types';

interface ServerToClientEvents {
  event: (e: SocketEvent) => void;
  error: (e: { code: string; channel?: string }) => void;
}

interface ClientToServerEvents {
  join: (channel: string) => void;
  leave: (channel: string) => void;
}

export type DoradoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: DoradoSocket | null = null;

export function getSocket(token: string): DoradoSocket {
  if (!socket) {
    socket = io(process.env['NEXT_PUBLIC_SOCKET_URL'] ?? 'http://localhost:3001', {
      auth: { token },
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
