import { SignJWT, importPKCS8 } from 'jose';
import { query } from './db.js';
import { logger } from './logger.js';
import { config } from './config.js';

type PushSubscriptionRow = {
  user_id: string;
  expo_push_token: string;
};

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

// Direct FCM HTTP v1 delivery (not Expo's hosted push relay): the relay
// requires uploading an FCM service account through `eas credentials`, an
// interactive-only wizard with no non-interactive/CI path. Minting our own
// OAuth2 access token from the Firebase service account keeps this fully
// scriptable and removes a dependency on Expo's push infrastructure.
const FCM_TOKEN_PATTERN = /^[A-Za-z0-9_:.-]{50,4096}$/;
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MAX_BATCH = 100;
const FCM_CONCURRENCY = 20;

let serviceAccount: { project_id: string; client_email: string; private_key: string } | null | undefined;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount() {
  if (serviceAccount !== undefined) return serviceAccount;
  if (!config.FCM_SERVICE_ACCOUNT_JSON) {
    serviceAccount = null;
    return serviceAccount;
  }
  try {
    const parsed = JSON.parse(config.FCM_SERVICE_ACCOUNT_JSON) as Record<string, unknown>;
    if (typeof parsed.project_id !== 'string' || typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      throw new Error('missing fields');
    }
    serviceAccount = { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key };
  } catch (error) {
    logger.warn('fcm_service_account_invalid', { error: error instanceof Error ? error.message : 'unknown' });
    serviceAccount = null;
  }
  return serviceAccount;
}

export const isPushConfigured = () => getServiceAccount() !== null;

// Test-only: module-level caches (service account parse result, OAuth
// access token) otherwise leak across test cases sharing this module instance.
export function resetPushClientForTests() {
  serviceAccount = undefined;
  cachedAccessToken = null;
}

async function getAccessToken(): Promise<string> {
  const account = getServiceAccount();
  if (!account) throw new Error('FCM_NOT_CONFIGURED');

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) return cachedAccessToken.token;

  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(account.client_email)
    .setAudience(FCM_TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch(FCM_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`FCM_TOKEN_HTTP_${response.status}`);
  const json = await response.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('FCM_TOKEN_MISSING');

  cachedAccessToken = { token: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
  return cachedAccessToken.token;
}
const MAX_PUSH_TITLE_LENGTH = 64;
const MAX_PUSH_BODY_LENGTH = 160;
const MAX_PUSH_DATA_VALUE_LENGTH = 128;
const ALLOWED_PUSH_DATA_KEYS = new Set(['type', 'conversationId', 'messageId', 'senderId', 'requestId']);
const ALLOWED_PUSH_TYPES = new Set(['message', 'kpulse', 'contact_request', 'group_invite']);

function assertMetadataOnlyPushPayload(payload: PushPayload) {
  if (!payload.title || payload.title.length > MAX_PUSH_TITLE_LENGTH) {
    throw new Error('PUSH_INVALID_TITLE');
  }
  if (!payload.body || payload.body.length > MAX_PUSH_BODY_LENGTH) {
    throw new Error('PUSH_INVALID_BODY');
  }

  const data = payload.data ?? {};
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_PUSH_DATA_KEYS.has(key)) throw new Error(`PUSH_DATA_KEY_NOT_ALLOWED:${key}`);
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PUSH_DATA_VALUE_LENGTH) {
      throw new Error(`PUSH_DATA_VALUE_INVALID:${key}`);
    }
  }
  if ('type' in data && !ALLOWED_PUSH_TYPES.has(data.type)) throw new Error('PUSH_TYPE_NOT_ALLOWED');

  // Push notifications are deliberately metadata-only. Message content,
  // ciphertext, tokens and credentials belong neither in the notification body
  // nor in Expo data payloads, even if a future caller accidentally supplies one.
  const serialized = JSON.stringify({ title: payload.title, body: payload.body, data }).toLowerCase();
  const forbiddenMarkers = [
    'plaintext',
    'ciphertext',
    'authorization',
    'access_token',
    'refresh_token',
    'private_key',
    'session_record',
  ];
  if (forbiddenMarkers.some((marker) => serialized.includes(marker))) {
    throw new Error('PUSH_SENSITIVE_CONTENT_REJECTED');
  }
}

async function listEnabledSubscriptions(userIds: string[]): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const { rows } = await query<PushSubscriptionRow>(
    `select user_id, expo_push_token
       from public.push_subscriptions
      where user_id = any($1::uuid[])
        and enabled = true`,
    [userIds],
  );
  return rows.filter((row) => FCM_TOKEN_PATTERN.test(row.expo_push_token));
}

async function disableSubscription(token: string) {
  await query(
    `update public.push_subscriptions
        set enabled = false,
            updated_at = now()
      where expo_push_token = $1`,
    [token],
  );
}

async function sendOne(projectId: string, accessToken: string, row: PushSubscriptionRow, payload: PushPayload) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: row.expo_push_token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: 'high' },
      },
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.ok) return;

  const errorBody = await response.json().catch(() => null) as { error?: { status?: string } } | null;
  if (errorBody?.error?.status === 'UNREGISTERED' || errorBody?.error?.status === 'NOT_FOUND') {
    await disableSubscription(row.expo_push_token);
    return;
  }
  throw new Error(`FCM_SEND_HTTP_${response.status}`);
}

async function postBatch(projectId: string, accessToken: string, rows: PushSubscriptionRow[], payload: PushPayload) {
  for (let index = 0; index < rows.length; index += FCM_CONCURRENCY) {
    const slice = rows.slice(index, index + FCM_CONCURRENCY);
    await Promise.all(slice.map((row) => sendOne(projectId, accessToken, row, payload).catch((error) => {
      logger.warn('fcm_send_failed', { userId: row.user_id, error: error instanceof Error ? error.message : 'unknown' });
    })));
  }
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return;

  const account = getServiceAccount();
  if (!account) return;

  try {
    assertMetadataOnlyPushPayload(payload);
    const subscriptions = await listEnabledSubscriptions(uniqueUserIds);
    if (subscriptions.length === 0) return;
    const accessToken = await getAccessToken();
    for (let index = 0; index < subscriptions.length; index += MAX_BATCH) {
      await postBatch(account.project_id, accessToken, subscriptions.slice(index, index + MAX_BATCH), payload);
    }
  } catch (error) {
    // Push is best-effort and must never break messaging/realtime delivery.
    logger.warn('push_delivery_failed', {
      recipients: uniqueUserIds.length,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function sendConversationPush(
  conversationId: string,
  senderId: string,
  messageId: string,
) {
  try {
    const { rows } = await query<{ user_id: string }>(
      `select user_id
         from public.conversation_members
        where conversation_id = $1
          and user_id <> $2`,
      [conversationId, senderId],
    );

    await sendPushToUsers(rows.map((row) => row.user_id), {
      title: 'K-ssenger',
      body: '💬 Nouveau message',
      data: {
        type: 'message',
        conversationId,
        messageId,
      },
    });
  } catch (error) {
    logger.warn('conversation_push_recipient_lookup_failed', {
      conversationId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function sendKPulsePush(recipientId: string, senderId: string) {
  await sendPushToUsers([recipientId], {
    title: 'K-ssenger',
    body: '⚡ K-Pulse reçu',
    data: {
      type: 'kpulse',
      senderId,
    },
  });
}

export async function sendContactRequestPush(
  recipientId: string,
  senderId: string,
  senderName: string,
  requestId: string,
  mutualCount: number,
) {
  const suffix = mutualCount > 0 ? ` · ${mutualCount} ami${mutualCount > 1 ? 's' : ''} en commun` : '';
  await sendPushToUsers([recipientId], {
    title: 'K-ssenger',
    body: `👋 ${senderName} veut t'ajouter${suffix}`,
    data: {
      type: 'contact_request',
      senderId,
      requestId,
    },
  });
}

export async function sendGroupInvitePush(
  recipientId: string,
  actorId: string,
  actorName: string,
  conversationId: string,
  groupTitle: string,
) {
  await sendPushToUsers([recipientId], {
    title: 'K-ssenger',
    body: `👥 ${actorName} t'a ajouté au groupe "${groupTitle}"`,
    data: {
      type: 'group_invite',
      senderId: actorId,
      conversationId,
    },
  });
}
