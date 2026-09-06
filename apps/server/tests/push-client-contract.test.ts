import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  resolve(process.cwd(), '../mobile/App.tsx'),
  'utf8',
);
const pushClientSource = readFileSync(
  resolve(process.cwd(), '../mobile/src/features/push/usePushRegistration.ts'),
  'utf8',
);

describe('mobile push privacy contract', () => {
  it('revokes push before ending the authenticated session', () => {
    const revokeIndex = appSource.indexOf('await unregisterPushForSignOut(profile.id)');
    const signOutIndex = appSource.indexOf('await getBackend().auth.signOut()');
    expect(revokeIndex).toBeGreaterThan(-1);
    expect(signOutIndex).toBeGreaterThan(revokeIndex);
  });

  it('removes the account subscription and attempts native token revocation', () => {
    expect(pushClientSource).toContain(".from('push_subscriptions')");
    expect(pushClientSource).toContain('.delete()');
    expect(pushClientSource).toContain('Notifications.unregisterForNotificationsAsync()');
    expect(pushClientSource).toContain('Notifications.dismissAllNotificationsAsync()');
  });

  it('fails closed when neither remote nor native revocation succeeds', () => {
    expect(pushClientSource).toContain("throw new Error('KSSENGER_PUSH_SIGNOUT_REVOCATION_FAILED')");
    expect(appSource).toContain('Déconnexion sécurisée impossible');
  });
});
