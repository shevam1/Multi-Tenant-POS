'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(storeId: string, tenantId: string): Socket {
  if (!socket || socket.disconnected) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    socket = io(`${base}/realtime`, {
      query: { storeId, tenantId },
      transports: ['websocket'],
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
