import { useEffect, useState } from 'react';
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

    void auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data.session) {
          setState({ loading: false, configured: true, session: null });
          return;
        }
        setState({ loading: false, configured: true, session: data.session as KssengerSession });
      })
      .catch(() => {
        if (active) setState({ loading: false, configured: true, session: null });
      });

    const { data: listener } = auth.onAuthStateChange((_event, session) => {
      if (active) setState({ loading: false, configured: true, session: (session as KssengerSession | null) ?? null });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
