import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
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

function platformName(): 'android' | 'ios' | null {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return null;
}

async function getNativePushToken(): Promise<string | null> {
  const platform = platformName();
  if (!platform || !Device.isDevice) return null;

  if (platform === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'K-ssenger',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 100, 180],
      sound: 'default',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('KSSENGER_EXPO_PROJECT_ID_MISSING');
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  return result.data || null;
}

export async function clearMyPushSubscriptions(userId: string) {
  const { error } = await getBackend()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

async function registerPushSubscription(userId: string) {
  const platform = platformName();
  if (!platform) return;
  const token = await getNativePushToken();
  if (!token) return;

  // A refreshed native token supersedes older tokens for this account/platform.
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
      .update({ enabled: true, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
