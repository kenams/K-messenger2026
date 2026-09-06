import { createAuthClient } from '@neondatabase/neon-js/auth';
import { getBackend } from './backend';
import { requireNeonBackend } from './neonConfig';

let authClient: ReturnType<typeof createAuthClient> | null = null;

type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: boolean;
};

type PasswordChangeResult = {
  error?: { message?: string } | null;
};

type PasswordChangeCapableClient = {
  changePassword: (input: PasswordChangeInput) => Promise<PasswordChangeResult>;
};

export function getNeonAuth() {
  if (!authClient) {
    const { authUrl } = requireNeonBackend();
    authClient = createAuthClient(authUrl);
  }
  return authClient;
}

export async function changeNeonPassword(input: PasswordChangeInput): Promise<PasswordChangeResult> {
  const client = getNeonAuth() as unknown as Partial<PasswordChangeCapableClient>;
  if (typeof client.changePassword !== 'function') {
    throw new Error('KSSENGER_PASSWORD_CHANGE_UNAVAILABLE');
  }
  return client.changePassword(input);
}

/**
 * Re-authenticates the already signed-in account with its password and returns
 * the newly issued access token. The password is never stored by K-ssenger.
 */
export async function reauthenticateNeonPassword(password: string): Promise<string> {
  const backend = getBackend();
  const current = await backend.auth.getSession();
  if (current.error) throw current.error;
  const session = current.data.session as ({ user?: { email?: string | null } } | null);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) throw new Error('KSSENGER_REAUTH_EMAIL_UNAVAILABLE');

  const result = await backend.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  const freshSession = result.data.session as ({ access_token?: string } | null);
  const token = freshSession?.access_token;
  if (!token) throw new Error('KSSENGER_REAUTH_TOKEN_UNAVAILABLE');
  return token;
}
