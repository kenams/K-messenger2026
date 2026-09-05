import { createAuthClient } from '@neondatabase/neon-js/auth';
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

export async function changeNeonPassword(input: PasswordChangeInput): Promise<PasswordChangeResult> {
  const client = getNeonAuth() as unknown as Partial<PasswordChangeCapableClient>;
  if (typeof client.changePassword !== 'function') {
    throw new Error('KSSENGER_PASSWORD_CHANGE_UNAVAILABLE');
  }
  return client.changePassword(input);
}
