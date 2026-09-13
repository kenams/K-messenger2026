import { useCallback } from 'react';
import { emitAck, getRealtimeSocket } from '../../lib/realtime';

/**
 * K-Live signalling: mints LiveKit tokens over the existing K-ssenger
 * socket. Actual media (camera/mic/video rendering) is platform-specific —
 * see LiveScreen.tsx (web, @livekit/components-react) and
 * LiveScreen.native.tsx (native, @livekit/react-native) — this hook only
 * gets each side a token + room to connect to.
 */
export type LiveSession = { ok: true; token: string; url: string; roomName: string };

async function call<T>(event: string, payload: unknown): Promise<T> {
  const socket = await getRealtimeSocket();
  const result = await emitAck<T & { ok: boolean; error?: string }>(socket, event, payload);
  if (!result.ok) throw new Error(result.error ?? 'REJECTED');
  return result;
}

export function useLiveSocket() {
  const startLive = useCallback(() => call<LiveSession>('live:start', {}), []);
  const joinLive = useCallback((broadcasterId: string) => call<LiveSession>('live:join', { userId: broadcasterId }), []);
  const stopLive = useCallback(() => call<{ ok: true }>('live:stop', {}), []);
  return { startLive, joinLive, stopLive };
}
