import { useEffect } from 'react';
import { getBackend } from '../../lib/backend';
import { getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

type KPulsePayload = { senderId?: string };

/**
 * Listens for incoming K-Pulses on the realtime socket, resolves the sender's
 * display name, and hands it to `onPulse` so the burst fires on any screen.
 */
export function useKPulseReceiver(onPulse: (fromName?: string) => void): void {
  useEffect(() => {
    if (!isRealtimeConfigured) return;
    let active = true;
    let socket: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;

    const handler = (payload: KPulsePayload) => {
      const senderId = payload?.senderId;
      if (!senderId) {
        onPulse();
        return;
      }
      void (async () => {
        try {
          const { data } = await getBackend()
            .from('profiles')
            .select('display_name,nickname')
            .eq('id', senderId)
            .maybeSingle();
          if (!active) return;
          const row = data as { display_name?: string; nickname?: string } | null;
          onPulse(row?.nickname || row?.display_name || undefined);
        } catch {
          if (active) onPulse();
        }
      })();
    };

    void getRealtimeSocket()
      .then((client) => {
        if (!active) return;
        socket = client;
        client.on('kpulse:receive', handler);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      socket?.off('kpulse:receive', handler);
    };
  }, [onPulse]);
}
