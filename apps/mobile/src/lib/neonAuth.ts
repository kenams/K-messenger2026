import { createAuthClient } from '@neondatabase/neon-js/auth';
import { requireNeonBackend } from './neonConfig';

let authClient: ReturnType<typeof createAuthClient> | null = null;

/**
 * K-ssenger mobile auth is scoped exclusively to the dedicated Neon branch.
 * No fallback backend is allowed here.
 */
export function getNeonAuth() {
  if (!authClient) {
    const { authUrl } = requireNeonBackend();
    authClient = createAuthClient(authUrl);
  }
  return authClient;
}
