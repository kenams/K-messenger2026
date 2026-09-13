import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

/**
 * Real browser notifications (OS-level, fire regardless of which tab/screen
 * is active) for the events that already exist server-side — new messages,
 * K-Pulse, and K-Live going up — so the web app feels alive without staring
 * at the Contacts/Chats tab. Mobile gets these via expo-notifications
 * (usePushRegistration) instead; this hook is a no-op there.
 */
export function useWebNotifications(currentUserId: string): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || !isRealtimeConfigured || typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') void Notification.requestPermission();

    let socket: Socket | null = null;
    let active = true;

    const notify = (title: string, body: string) => {
      if (Notification.permission !== 'granted') return;
      if (document.visibilityState === 'visible' && document.hasFocus()) return; // already looking at it
      try { new Notification(title, { body, icon: '/favicon.ico', tag: title }); } catch { /* best effort */ }
    };

    const onMessage = (payload: { senderUserId?: string; ciphertext?: string }) => {
      if (!payload?.senderUserId || payload.senderUserId === currentUserId) return;
      notify('Nouveau message K-ssenger', (payload.ciphertext ?? '').slice(0, 120) || 'Tu as reçu un message.');
    };
    const onKPulse = () => {
      notify('⚡ K-Pulse', 'Quelqu’un t’a envoyé un K-Pulse.');
    };
    const onLiveStarted = (payload: { broadcasterName?: string }) => {
      notify('🔴 K-Live', `${payload?.broadcasterName ?? 'Un contact'} est en direct.`);
    };

    void getRealtimeSocket().then((client) => {
      if (!active) return;
      socket = client;
      client.on('message:new', onMessage);
      client.on('kpulse:receive', onKPulse);
      client.on('live:started', onLiveStarted);
    });

    return () => {
      active = false;
      socket?.off('message:new', onMessage);
      socket?.off('kpulse:receive', onKPulse);
      socket?.off('live:started', onLiveStarted);
    };
  }, [currentUserId]);
}
