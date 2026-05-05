'use client';

import { useSocketContext } from './socket-provider';
import type { DoradoSocket } from './client';

export function useSocket(): DoradoSocket | null {
  return useSocketContext();
}
