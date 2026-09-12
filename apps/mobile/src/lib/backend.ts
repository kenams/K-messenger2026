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

// Neon Auth (better-auth) rejects requests with no Origin header
// ("MISSING_ORIGIN") once callbackURL isn't absolute. Browsers set Origin
// automatically; React Native's fetch never does, so every native sign-up/
// sign-in call failed server-side with a generic error before this. The
// value must match a trusted origin already configured in the Neon Auth
// dashboard (the same one the web build serves from).
const NATIVE_AUTH_ORIGIN = 'https://k-ssenger.expo.app';

function createKssengerClient() {
  const { authUrl, dataApiUrl } = requireNeonBackend();
  return createClient({
    auth: {
      adapter: SupabaseAuthAdapter({
        fetchOptions: { headers: { Origin: NATIVE_AUTH_ORIGIN } },
      }),
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
