import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getBackend } from './backend';

type SignalCleanupBridge = {
  clearDeviceState: (deviceUuid: string) => Promise<boolean>;
};

const bridge = requireOptionalNativeModule<SignalCleanupBridge>('KssengerSignalBridge');

/**
 * Capture the authenticated account's server device IDs before provider-side
 * deletion removes those rows, then erase any local native key material after
 * the server acknowledges deletion.
 *
 * Native E2EE (libsignal) is not shipped right now, so on a build without the
 * native bridge there is no local identity/session material to purge and this
 * is a no-op. When a vetted native bridge returns, Android fails closed if the
 * device inventory cannot be obtained.
 */
export async function prepareLocalSignalAccountPurge(userId: string): Promise<() => Promise<void>> {
  if (Platform.OS !== 'android' || !bridge) return async () => undefined;

  const { data, error } = await getBackend()
    .from('devices')
    .select('id')
    .eq('user_id', userId)
    .limit(50);
  if (error) throw new Error('KSSENGER_SIGNAL_PURGE_DEVICE_LOOKUP_FAILED');

  const deviceIds = [...new Set(
    (((data ?? []) as unknown) as Array<{ id?: unknown }>)
      .map((row) => typeof row.id === 'string' ? row.id : '')
      .filter(Boolean),
  )];

  return async () => {
    for (const deviceId of deviceIds) {
      const cleared = await bridge.clearDeviceState(deviceId);
      if (cleared !== true) throw new Error('KSSENGER_SIGNAL_PURGE_FAILED');
    }
  };
}
