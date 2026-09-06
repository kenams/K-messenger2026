import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Socket } from 'socket.io-client';
import { disconnectRealtimeSocket, emitAck, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

async function publish(socket: Socket, status: 'online' | 'away' | 'offline') {
  try {
    await emitAck(socket, 'presence:update', { status });
  } catch {
    // Reconnect is handled by socket.io; the next lifecycle/connect event retries.
  }
}

export function useRealtimePresence() {
  useEffect(() => {
    if (!isRealtimeConfigured) return;

    let active = true;
    let socket: Socket | null = null;

    const onAppState = (state: AppStateStatus) => {
      if (!socket?.connected) return;
      void publish(socket, state === 'active' ? 'online' : 'away');
    };

    void getRealtimeSocket().then((client) => {
      if (!active) return;
      socket = client;
      const onConnect = () => void publish(client, AppState.currentState === 'active' ? 'online' : 'away');
      client.on('connect', onConnect);
      onConnect();
    }).catch(() => undefined);

    const subscription = AppState.addEventListener('change', onAppState);

    return () => {
      active = false;
      subscription.remove();
      if (socket) {
        socket.removeAllListeners('connect');
        if (socket.connected) void publish(socket, 'offline');
      }
      disconnectRealtimeSocket();
    };
  }, []);
}
