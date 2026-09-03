import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isBackendConfigured } from '../../lib/supabase';

export type AuthSessionState = {
  loading: boolean;
  configured: boolean;
  session: Session | null;
};

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    loading: isBackendConfigured,
    configured: isBackendConfigured,
    session: null,
  });

  useEffect(() => {
    if (!isBackendConfigured) return;

    const supabase = getSupabase();
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setState({ loading: false, configured: true, session: null });
        return;
      }
      setState({ loading: false, configured: true, session: data.session });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ loading: false, configured: true, session });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
