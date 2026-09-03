import 'react-native-url-polyfill/auto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { isNeonBackendConfigured, requireNeonBackend } from './neonConfig';

/**
 * Dedicated K-ssenger Neon client.
 *
 * SupabaseAuthAdapter is only the compatibility surface exposed by the Neon SDK;
 * it does not connect K-ssenger to a Supabase project. Auth and Data API URLs are
 * both required from the dedicated K-ssenger Neon project and configuration
 * fails closed when either is missing.
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

export function getBackend() {
  if (!client) client = createKssengerClient();
  return client;
}
