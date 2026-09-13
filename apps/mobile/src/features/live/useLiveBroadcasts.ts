import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

/**
 * Tracks which contacts are currently K-Live, from the 'live:started' /
 * 'live:stopped' broadcasts the server sends to a broadcaster's audience
 * (server.ts, same fan-out pattern as presence:changed).
 */
export function useLiveBroadcasts(): Map<string, string> {
  const [live, setLive] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isRealtimeConfigured) return;
    let active = true;
    let socket: Socket | null = null;

    const onStarted = (payload: { broadcasterId: string; broadcasterName: string }) => {
      setLive((current) => new Map(current).set(payload.broadcasterId, payload.broadcasterName));
    };
    const onStopped = (payload: { broadcasterId: string }) => {
      setLive((current) => {
        if (!current.has(payload.broadcasterId)) return current;
        const next = new Map(current);
        next.delete(payload.broadcasterId);
        return next;
      });
    };

    void getRealtimeSocket().then((client) => {
      if (!active) return;
      socket = client;
      client.on('live:started', onStarted);
      client.on('live:stopped', onStopped);
    });

    return () => {
      active = false;
      socket?.off('live:started', onStarted);
      socket?.off('live:stopped', onStopped);
    };
  }, []);

  return live;
}
