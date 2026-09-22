import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { getBackend } from '../../lib/backend';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function platformName(): 'android' | 'ios' | 'web' | null {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'web') return 'web';
  return null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = globalThis.atob(base64Safe);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Browser Web Push subscription (works even with the tab closed, unlike the
 * Notification API used by useWebNotifications.ts which only fires while a
 * tab is open and connected). No-ops without HTTPS/a service worker/the
 * public VAPID key, or if the visitor never grants permission — push stays
 * strictly optional everywhere in this app.
 */
async function getWebPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return null;

  const existing = await Notification.requestPermission();
  if (existing !== 'granted') return null;

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const current = await registration.pushManager.getSubscription();
  if (current) return current;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
  });
}

async function getNativePushToken(): Promise<string | null> {
  const platform = platformName();
  // Server delivery goes straight to FCM HTTP v1 (see apps/server/src/push.ts)
  // rather than Expo's hosted push relay, so only the raw native FCM
  // registration token is useful here — no EAS project ID needed. iOS isn't
  // shipped yet and would need an APNs-based send path, so it stays unregistered.
  if (platform !== 'android' || !Device.isDevice) return null;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'K-ssenger',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 100, 180],
    sound: 'default',
  });

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  const result = await Notifications.getDevicePushTokenAsync();
  return typeof result.data === 'string' ? result.data : null;
}

export async function clearMyPushSubscriptions(userId: string) {
  const { error } = await getBackend()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Prevent a logged-out account from continuing to receive private K-ssenger
 * metadata on this device. We require at least one remote revocation path to
 * succeed: delete the authenticated subscription row or unregister the native
 * token. Visible notifications are also dismissed after the revocation attempt.
 */
export async function unregisterPushForSignOut(userId: string) {
  let remoteRevoked = false;

  try {
    await clearMyPushSubscriptions(userId);
    remoteRevoked = true;
  } catch {
    // Native token revocation below is an independent privacy fallback.
  }

  try {
    if (Device.isDevice && platformName()) {
      await Notifications.unregisterForNotificationsAsync();
      remoteRevoked = true;
    }
  } catch {
    // Database deletion above is sufficient if it succeeded.
  }

  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  if (!remoteRevoked) throw new Error('KSSENGER_PUSH_SIGNOUT_REVOCATION_FAILED');
}

async function registerPushSubscription(userId: string) {
  const platform = platformName();
  if (!platform) return;

  let token: string;
  let webKeys: { p256dh: string; auth: string } | null = null;
  if (platform === 'web') {
    const subscription = await getWebPushSubscription();
    if (!subscription) return;
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
    token = json.endpoint;
    webKeys = { p256dh: json.keys.p256dh, auth: json.keys.auth };
  } else {
    const nativeToken = await getNativePushToken();
    if (!nativeToken) return;
    token = nativeToken;
  }

  // A refreshed token supersedes older tokens for this account/platform.
  const disableOld = await getBackend()
    .from('push_subscriptions')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('platform', platform)
    .neq('expo_push_token', token);
  if (disableOld.error) throw disableOld.error;

  const { data, error: lookupError } = await getBackend()
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('expo_push_token', token)
    .limit(1);
  if (lookupError) throw lookupError;

  const existing = ((data ?? []) as unknown) as Array<{ id?: string }>;
  if (existing[0]?.id) {
    const { error } = await getBackend()
      .from('push_subscriptions')
      .update({
        enabled: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(webKeys ? { web_p256dh: webKeys.p256dh, web_auth: webKeys.auth } : {}),
      })
      .eq('id', existing[0].id)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await getBackend().from('push_subscriptions').insert({
    user_id: userId,
    device_id: null,
    expo_push_token: token,
    platform,
    enabled: true,
    last_seen_at: new Date().toISOString(),
    ...(webKeys ? { web_p256dh: webKeys.p256dh, web_auth: webKeys.auth } : {}),
  });
  if (error) throw error;
}

export function usePushRegistration(userId: string) {
  useEffect(() => {
    let active = true;
    void registerPushSubscription(userId).catch(() => {
      // Push remains optional: refusal/provider failure must not block K-ssenger.
      if (!active) return;
    });
    return () => { active = false; };
  }, [userId]);
}
