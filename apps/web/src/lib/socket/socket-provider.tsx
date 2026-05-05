'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getSocket, disconnectSocket, type DoradoSocket } from './client';

const SocketContext = createContext<DoradoSocket | null>(null);

export function SocketProvider({ token, children }: { token: string; children: React.ReactNode }) {
  const [socket] = useState<DoradoSocket>(() => getSocket(token));

  useEffect(() => {
    socket.connect();

    socket.on('error', (e) => {
      if (e.code === 'FORBIDDEN') socket.disconnect();
    });

    return () => {
      disconnectSocket();
    };
  }, [socket]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocketContext(): DoradoSocket | null {
  return useContext(SocketContext);
}
