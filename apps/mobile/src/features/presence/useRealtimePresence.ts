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

    let onConnect: (() => void) | null = null;

    void getRealtimeSocket().then((client) => {
      if (!active) return;
      socket = client;
      // AppState.currentState isn't reliably 'active' at first render on web
      // (react-native-web only sets it once a visibilitychange event fires,
      // so a tab that's been focused the whole time never gets one) — that
      // left everyone showing "away" (orange) instead of "online" (green)
      // until they blurred and refocused the window at least once.
      // Connecting the realtime socket at all means the user is actively
      // using the app right now, so publish 'online' unconditionally here;
      // AppState changes still drive away/offline afterwards.
      onConnect = () => void publish(client, 'online');
      client.on('connect', onConnect);
      onConnect();
    }).catch(() => undefined);

    const subscription = AppState.addEventListener('change', onAppState);

    return () => {
      active = false;
      subscription.remove();
      if (socket) {
        if (onConnect) socket.off('connect', onConnect);
        if (socket.connected) void publish(socket, 'offline');
      }
      disconnectRealtimeSocket();
    };
  }, []);
}
