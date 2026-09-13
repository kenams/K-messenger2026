import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getBackend, isBackendConfigured, onAuthStateMayHaveChanged } from '../../lib/backend';

export type KssengerSession = {
  user: { id: string; email?: string | null };
};

export type AuthSessionState = {
  loading: boolean;
  configured: boolean;
  session: KssengerSession | null;
};

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({ loading: isBackendConfigured, configured: isBackendConfigured, session: null });

  useEffect(() => {
    if (!isBackendConfigured) return;

    const auth = getBackend().auth;
    let active = true;
    let refreshSequence = 0;
    let hasSession = false;

    const refreshSession = async (showLoading = false, preserveOnError = false) => {
      const sequence = ++refreshSequence;
      if (showLoading && active) {
        setState((current) => ({ ...current, loading: true }));
      }
      try {
        const { data, error } = await auth.getSession();
        if (!active || sequence !== refreshSequence) return;
        if (error) {
          if (preserveOnError) {
            setState((current) => ({ ...current, loading: false, configured: true }));
          } else {
            hasSession = false;
            setState({ loading: false, configured: true, session: null });
          }
          return;
        }
        if (!data.session) {
          hasSession = false;
          setState({ loading: false, configured: true, session: null });
          return;
        }
        hasSession = true;
        setState({ loading: false, configured: true, session: data.session as KssengerSession });
      } catch {
        if (!active || sequence !== refreshSequence) return;
        if (preserveOnError) {
          setState((current) => ({ ...current, loading: false, configured: true }));
        } else {
          hasSession = false;
          setState({ loading: false, configured: true, session: null });
        }
      }
    };

    void refreshSession(true, false);

    const { data: listener } = auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      refreshSequence += 1;
      hasSession = !!session;
      setState({ loading: false, configured: true, session: (session as KssengerSession | null) ?? null });
    });

    const unsubscribeAuthEvents = onAuthStateMayHaveChanged(() => { void refreshSession(false, false); });

    // Neon Auth persists a successful native sign-in even when its adapter does
    // not emit onAuthStateChange. While the user is still on the native auth
    // screen, briefly re-check the persisted session so quick login (and normal
    // login) enters the app without requiring an app restart/background cycle.
    // The probe becomes a no-op as soon as a session is present.
    const nativeAuthProbe = Platform.OS === 'web'
      ? null
      : setInterval(() => {
          if (!hasSession) void refreshSession(false, false);
        }, 1_000);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Mobile OSes can suspend K-ssenger long enough for an auth session to
        // expire or be revoked elsewhere. Re-check Neon Auth when the app
        // returns to foreground. A transient network failure must not destroy
        // the persisted offline session; an authenticated empty response or an
        // explicit auth-state event still clears it normally.
        void refreshSession(false, true);
      }
    });

    return () => {
      active = false;
      refreshSequence += 1;
      listener.subscription.unsubscribe();
      unsubscribeAuthEvents();
      if (nativeAuthProbe) clearInterval(nativeAuthProbe);
      appStateSubscription.remove();
    };
  }, []);

  return state;
}
