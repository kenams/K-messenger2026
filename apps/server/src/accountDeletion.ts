import { z } from 'zod';
import { config } from './config.js';
import { authenticateFreshAccessToken } from './auth.js';

const KSSENGER_NEON_PROJECT_ID = 'late-flower-65059830';
const KSSENGER_NEON_BRANCH_ID = 'br-falling-sea-b1k36u32';
const NEON_API_BASE = 'https://console.neon.tech/api/v2';

const userIdSchema = z.string().uuid();
export const accountDeleteRequestSchema = z.object({
  freshAccessToken: z.string().min(20).max(16_384),
  confirmation: z.literal('DELETE'),
}).strict();

type DeleteOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export async function deleteKssengerAuthUser(userId: string, options: DeleteOptions = {}) {
  const parsedUserId = userIdSchema.parse(userId);
  const apiKey = options.apiKey ?? config.NEON_API_KEY;
  if (!apiKey) throw new Error('ACCOUNT_DELETE_PROVIDER_NOT_CONFIGURED');
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = `${NEON_API_BASE}/projects/${KSSENGER_NEON_PROJECT_ID}/branches/${KSSENGER_NEON_BRANCH_ID}/auth/users/${encodeURIComponent(parsedUserId)}`;
  const response = await fetchImpl(url, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status !== 204) {
    throw new Error(`ACCOUNT_DELETE_PROVIDER_${response.status}`);
  }
}

export async function authorizeAndDeleteOwnAccount(
  socketUserId: string,
  raw: unknown,
  options: DeleteOptions = {},
) {
  const request = accountDeleteRequestSchema.parse(raw);
  const freshUserId = await authenticateFreshAccessToken(request.freshAccessToken, 300);
  if (freshUserId !== socketUserId) throw new Error('ACCOUNT_DELETE_IDENTITY_MISMATCH');
  await deleteKssengerAuthUser(socketUserId, options);
}

export const KSSENGER_ACCOUNT_DELETE_SCOPE = Object.freeze({
  projectId: KSSENGER_NEON_PROJECT_ID,
  branchId: KSSENGER_NEON_BRANCH_ID,
});
