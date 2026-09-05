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
