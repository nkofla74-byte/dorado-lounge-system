import type { Socket, Server } from 'socket.io';
import { registerMensajeChatHandler } from './mensaje-chat';
import { registerBroadcastHandler } from './broadcast';
import { registerStuartRequestHandler } from './stuart-request';

export function registerHandlers(socket: Socket, io: Server): void {
  registerMensajeChatHandler(socket, io);
  registerBroadcastHandler(socket, io);
  registerStuartRequestHandler(socket, io);
}
