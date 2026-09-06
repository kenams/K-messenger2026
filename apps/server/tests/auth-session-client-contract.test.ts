import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), '../mobile/src/features/auth/useAuthSession.ts'),
  'utf8',
);

describe('mobile auth session lifecycle contract', () => {
  it('revalidates Neon Auth when K-ssenger returns to the foreground', () => {
    expect(source).toContain("import { AppState } from 'react-native'");
    expect(source).toContain("AppState.addEventListener('change'");
    expect(source).toContain("nextState === 'active'");
    expect(source).toContain('void refreshSession(false, true)');
    expect(source).toContain('auth.getSession()');
  });

  it('preserves an existing offline session on transient foreground refresh errors', () => {
    expect(source).toContain('preserveOnError');
    expect(source).toContain("setState((current) => ({ ...current, loading: false, configured: true }))");
    expect(source).toContain('if (!data.session)');
    expect(source).toContain('session: null');
  });

  it('prevents stale async refreshes from overwriting a newer auth event', () => {
    expect(source).toContain('let refreshSequence = 0');
    expect(source).toContain('sequence !== refreshSequence');
    expect(source).toContain('refreshSequence += 1');
  });

  it('unsubscribes both auth and AppState listeners on unmount', () => {
    expect(source).toContain('listener.subscription.unsubscribe()');
    expect(source).toContain('appStateSubscription.remove()');
  });
});
