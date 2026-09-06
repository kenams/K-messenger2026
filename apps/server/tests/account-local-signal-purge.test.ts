import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const accountScreen = readFileSync(
  resolve(process.cwd(), '../mobile/src/features/profile/AccountDataScreen.tsx'),
  'utf8',
);
const cleanupSource = readFileSync(
  resolve(process.cwd(), '../mobile/src/lib/signalCleanup.ts'),
  'utf8',
);
const nativeModule = readFileSync(
  resolve(process.cwd(), '../mobile/modules/kssenger-signal/android/src/main/java/com/kahdigital/kssenger/signal/KssengerSignalModule.kt'),
  'utf8',
);
const blobStore = readFileSync(
  resolve(process.cwd(), '../mobile/modules/kssenger-signal/android/src/main/java/com/kahdigital/kssenger/signal/KeystoreBlobStore.kt'),
  'utf8',
);

describe('account deletion local Signal state purge', () => {
  it('captures the device inventory before provider deletion and purges only after server success', () => {
    const prepare = accountScreen.indexOf('prepareLocalSignalAccountPurge(profile.id)');
    const deletion = accountScreen.indexOf("emitAck<DeleteAck>(socket, 'account:delete'");
    const ack = accountScreen.indexOf('if (!response.ok)');
    const purge = accountScreen.indexOf('await purgeLocalSignalState()');
    const signOut = accountScreen.indexOf('await getBackend().auth.signOut()');

    expect(prepare).toBeGreaterThan(-1);
    expect(deletion).toBeGreaterThan(prepare);
    expect(ack).toBeGreaterThan(deletion);
    expect(purge).toBeGreaterThan(ack);
    expect(signOut).toBeGreaterThan(purge);
  });

  it('fails closed on Android if the native purge bridge or device lookup is unavailable', () => {
    expect(cleanupSource).toContain("if (!bridge) throw new Error('KSSENGER_SIGNAL_PURGE_BRIDGE_MISSING')");
    expect(cleanupSource).toContain("throw new Error('KSSENGER_SIGNAL_PURGE_DEVICE_LOOKUP_FAILED')");
    expect(cleanupSource).toContain('await bridge.clearDeviceState(deviceId)');
  });

  it('destroys both encrypted records and the Android Keystore wrapping key', () => {
    expect(nativeModule).toContain('AsyncFunction("clearDeviceState")');
    expect(nativeModule).toContain('.clearAndDestroyKey()');
    expect(blobStore).toContain('preferences.edit().clear().commit()');
    expect(blobStore).toContain('keyStore.deleteEntry(keyAlias)');
  });
});
