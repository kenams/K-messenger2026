import 'react-native-url-polyfill/auto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { isNeonBackendConfigured, requireNeonBackend } from './neonConfig';

/**
 * Transitional compatibility shim: existing mobile call sites still import
 * getSupabase(), but the returned client is now the dedicated K-ssenger Neon
 * Auth + Data API client. No Supabase project or key is used at runtime.
 */
export const isBackendConfigured = isNeonBackendConfigured;

function createKssengerClient() {
  const { authUrl, dataApiUrl } = requireNeonBackend();
  return createClient({
    auth: {
      adapter: SupabaseAuthAdapter(),
      url: authUrl,
    },
    dataApi: {
      url: dataApiUrl,
    },
  });
}

let client: ReturnType<typeof createKssengerClient> | null = null;

export function getSupabase() {
  if (!client) client = createKssengerClient();
  return client;
}
