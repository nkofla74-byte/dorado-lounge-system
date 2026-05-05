'use client';

import { useEffect, useCallback } from 'react';
import type { Channel, SocketEvent, SocketEventType } from '@dorado/shared-types';
import { useSocket } from './use-socket';

// Suscribe al socket en `channel` y dispara `handler` solo para eventos del
// tipo `eventType`. Une el canal al montar y lo abandona al desmontar.
export function useRealtime<T extends SocketEventType>(
  channel: Channel,
  eventType: T,
  handler: (event: Extract<SocketEvent, { type: T }>) => void,
): void {
  const socket = useSocket();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(handler, []);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join', channel);

    const listener = (event: SocketEvent) => {
      if (event.type === eventType) {
        stableHandler(event as Extract<SocketEvent, { type: T }>);
      }
    };

    socket.on('event', listener);

    return () => {
      socket.off('event', listener);
      socket.emit('leave', channel);
    };
  }, [socket, channel, eventType, stableHandler]);
}
