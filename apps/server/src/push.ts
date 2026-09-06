import { query } from './db.js';
import { logger } from './logger.js';

type PushSubscriptionRow = {
  user_id: string;
  expo_push_token: string;
};

type ExpoTicket = {
  status?: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
const MAX_BATCH = 100;
const MAX_PUSH_TITLE_LENGTH = 64;
const MAX_PUSH_BODY_LENGTH = 160;
const MAX_PUSH_DATA_VALUE_LENGTH = 128;
const ALLOWED_PUSH_DATA_KEYS = new Set(['type', 'conversationId', 'messageId', 'senderId']);
const ALLOWED_PUSH_TYPES = new Set(['message', 'kpulse']);

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
  return rows.filter((row) => EXPO_TOKEN_PATTERN.test(row.expo_push_token));
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

async function postBatch(rows: PushSubscriptionRow[], payload: PushPayload) {
  const messages = rows.map((row) => ({
    to: row.expo_push_token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: 'default',
    priority: 'high',
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) throw new Error(`EXPO_PUSH_HTTP_${response.status}`);
  const json = await response.json() as { data?: ExpoTicket[] };
  const tickets = Array.isArray(json.data) ? json.data : [];

  await Promise.all(tickets.map(async (ticket, index) => {
    if (ticket?.status !== 'error') return;
    if (ticket.details?.error === 'DeviceNotRegistered') {
      const token = rows[index]?.expo_push_token;
      if (token) await disableSubscription(token);
    }
  }));
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return;

  try {
    assertMetadataOnlyPushPayload(payload);
    const subscriptions = await listEnabledSubscriptions(uniqueUserIds);
    for (let index = 0; index < subscriptions.length; index += MAX_BATCH) {
      await postBatch(subscriptions.slice(index, index + MAX_BATCH), payload);
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
