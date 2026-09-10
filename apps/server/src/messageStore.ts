import type { z } from 'zod';
import { query } from './db.js';
import { requireGroupCanSend } from './groupModerationStore.js';
import { sendConversationPush } from './push.js';
import { messageHistorySchema, messageReactSchema, messageSendSchema } from './validation.js';

type Envelope = z.infer<typeof messageSendSchema>;
type HistoryRequest = z.infer<typeof messageHistorySchema>;
type ReactRequest = z.infer<typeof messageReactSchema>;

export type MessageReaction = { userId: string; reaction: string };

export async function listMessageReactions(messageId: string): Promise<MessageReaction[]> {
  const { rows } = await query<{ user_id: string; reaction: string }>(
    `select user_id, reaction from public.message_reactions where message_id = $1 order by created_at asc`,
    [messageId],
  );
  return rows.map((row) => ({ userId: row.user_id, reaction: row.reaction }));
}

async function reactionsForMessages(messageIds: string[]): Promise<Record<string, MessageReaction[]>> {
  if (!messageIds.length) return {};
  const { rows } = await query<{ message_id: string; user_id: string; reaction: string }>(
    `select message_id, user_id, reaction from public.message_reactions
      where message_id = any($1::uuid[]) order by created_at asc`,
    [messageIds],
  );
  const grouped: Record<string, MessageReaction[]> = {};
  for (const row of rows) {
    (grouped[row.message_id] ??= []).push({ userId: row.user_id, reaction: row.reaction });
  }
  return grouped;
}

/** Set or clear the caller's reaction on a message they can see. Returns the full list. */
export async function setMessageReaction(userId: string, request: ReactRequest): Promise<MessageReaction[]> {
  const { rowCount } = await query(
    `select 1 from public.messages where id = $1 and conversation_id = $2 limit 1`,
    [request.messageId, request.conversationId],
  );
  if (rowCount !== 1) throw new Error('MESSAGE_NOT_IN_CONVERSATION');

  if (request.reaction === null) {
    await query(`delete from public.message_reactions where message_id = $1 and user_id = $2`, [request.messageId, userId]);
  } else {
    await query(
      `insert into public.message_reactions (message_id, user_id, reaction)
       values ($1, $2, $3)
       on conflict (message_id, user_id) do update set reaction = excluded.reaction, created_at = now()`,
      [request.messageId, userId, request.reaction],
    );
  }
  return listMessageReactions(request.messageId);
}

// SECURITY NOTE: membership/device/block authorization still belongs to the
// authenticated Socket.IO call path, but group mute enforcement is repeated
// here at the persistence boundary so no future server-side caller can bypass
// a moderator mute simply by calling persistEncryptedMessage() directly.
export async function persistEncryptedMessage(userId: string, envelope: Envelope) {
  await requireGroupCanSend(userId, envelope.conversationId);

  const { rows } = await query<{ id: string; created_at: string; duplicate: boolean }>(
    `with inserted as (
       insert into public.messages (
         client_message_id,
         conversation_id,
         sender_user_id,
         sender_device_id,
         algorithm,
         ciphertext,
         nonce,
         aad,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (sender_user_id, client_message_id) do nothing
       returning id, created_at, false as duplicate
     )
     select id, created_at, duplicate from inserted
     union all
     select id, created_at, true as duplicate
       from public.messages
      where sender_user_id = $3
        and client_message_id = $1
     limit 1`,
    [
      envelope.clientMessageId,
      envelope.conversationId,
      userId,
      envelope.senderDeviceId,
      envelope.algorithm,
      envelope.ciphertext,
      envelope.nonce ?? null,
      envelope.aad ?? null,
      envelope.createdAt,
    ],
  );

  const stored = rows[0];
  if (!stored) throw new Error('MESSAGE_PERSIST_FAILED');

  if (!stored.duplicate) {
    // Do not include plaintext or ciphertext in push payloads. Delivery is
    // intentionally best-effort so a provider outage cannot fail messaging.
    void sendConversationPush(envelope.conversationId, userId, stored.id);
  }

  return { id: stored.id, createdAt: stored.created_at, duplicate: stored.duplicate };
}

export async function listEncryptedMessages(request: HistoryRequest) {
  const values: unknown[] = [request.conversationId, request.limit + 1];
  let beforeClause = '';
  if (request.before) {
    values.push(request.before);
    beforeClause = 'and created_at < $3';
  }

  const { rows } = await query<{
    id: string;
    client_message_id: string;
    conversation_id: string;
    sender_user_id: string;
    sender_device_id: string | null;
    algorithm: string;
    ciphertext: string;
    nonce: string | null;
    aad: string | null;
    created_at: string;
  }>(
    `select id,
            client_message_id,
            conversation_id,
            sender_user_id,
            sender_device_id,
            algorithm,
            ciphertext,
            nonce,
            aad,
            created_at
       from public.messages
      where conversation_id = $1
        ${beforeClause}
      order by created_at desc
      limit $2`,
    values,
  );

  const hasMore = rows.length > request.limit;
  const page = rows.slice(0, request.limit);
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;
  const reactions = await reactionsForMessages(page.map((row) => row.id));

  // Send each page oldest -> newest so clients can append/reconcile deterministically.
  return {
    messages: page.reverse().map((row) => ({
      id: row.id,
      clientMessageId: row.client_message_id,
      conversationId: row.conversation_id,
      senderUserId: row.sender_user_id,
      senderDeviceId: row.sender_device_id,
      algorithm: row.algorithm,
      ciphertext: row.ciphertext,
      nonce: row.nonce,
      aad: row.aad,
      createdAt: row.created_at,
      reactions: reactions[row.id] ?? [],
    })),
    nextCursor,
    hasMore,
  };
}
