import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getBackend, isBackendConfigured } from '../../lib/backend';

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
            setState({ loading: false, configured: true, session: null });
          }
          return;
        }
        if (!data.session) {
          setState({ loading: false, configured: true, session: null });
          return;
        }
        setState({ loading: false, configured: true, session: data.session as KssengerSession });
      } catch {
        if (!active || sequence !== refreshSequence) return;
        if (preserveOnError) {
          setState((current) => ({ ...current, loading: false, configured: true }));
        } else {
          setState({ loading: false, configured: true, session: null });
        }
      }
    };

    void refreshSession(true, false);

    const { data: listener } = auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      refreshSequence += 1;
      setState({ loading: false, configured: true, session: (session as KssengerSession | null) ?? null });
    });

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
      appStateSubscription.remove();
    };
  }, []);

  return state;
}
