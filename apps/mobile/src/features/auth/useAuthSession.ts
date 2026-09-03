import { useEffect, useState } from 'react';
import { getSupabase, isBackendConfigured } from '../../lib/supabase';

export type KssengerSession = {
  user: {
    id: string;
    email?: string | null;
  };
};

export type AuthSessionState = {
  loading: boolean;
  configured: boolean;
  session: KssengerSession | null;
};

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    loading: isBackendConfigured,
    configured: isBackendConfigured,
    session: null,
  });

  useEffect(() => {
    if (!isBackendConfigured) return;

    const auth = getSupabase().auth;
    let active = true;

    void auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.session) {
        setState({ loading: false, configured: true, session: null });
        return;
      }
      setState({ loading: false, configured: true, session: data.session as KssengerSession });
    });

    const { data: listener } = auth.onAuthStateChange((_event, session) => {
      if (active) {
        setState({
          loading: false,
          configured: true,
          session: (session as KssengerSession | null) ?? null,
        });
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
