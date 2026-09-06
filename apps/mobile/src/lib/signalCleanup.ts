import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getBackend } from './backend';

type SignalCleanupBridge = {
  clearDeviceState: (deviceUuid: string) => Promise<boolean>;
};

const bridge = requireOptionalNativeModule<SignalCleanupBridge>('KssengerSignalBridge');

/**
 * Capture the authenticated account's server device IDs before provider-side
 * deletion removes those rows. The returned function performs only local
 * Android Keystore erasure and is intentionally called after the server has
 * acknowledged permanent account deletion.
 *
 * Android fails closed before deletion if the device inventory/native bridge
 * cannot be obtained: a successful account deletion must not knowingly leave
 * recoverable Signal identity/session material on this phone.
 */
export async function prepareLocalSignalAccountPurge(userId: string): Promise<() => Promise<void>> {
  if (Platform.OS !== 'android') return async () => undefined;
  if (!bridge) throw new Error('KSSENGER_SIGNAL_PURGE_BRIDGE_MISSING');

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
