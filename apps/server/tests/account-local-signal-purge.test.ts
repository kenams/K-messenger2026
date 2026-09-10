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

describe('account deletion local state purge', () => {
  it('deletes on the server first, then purges local state, then signs out — in that order', () => {
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

  it('local purge is a safe no-op on builds without a native E2EE bridge', () => {
    // libsignal was removed (crashed the APK). Account deletion must not throw
    // just because there is no native key material to erase.
    expect(cleanupSource).toContain("if (Platform.OS !== 'android' || !bridge) return async () => undefined;");
    expect(cleanupSource).not.toContain("throw new Error('KSSENGER_SIGNAL_PURGE_BRIDGE_MISSING')");
  });

  it('still fails closed on device lookup errors when a native bridge is present', () => {
    expect(cleanupSource).toContain("throw new Error('KSSENGER_SIGNAL_PURGE_DEVICE_LOOKUP_FAILED')");
    expect(cleanupSource).toContain('await bridge.clearDeviceState(deviceId)');
  });
});
