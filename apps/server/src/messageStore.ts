import { supabaseAdmin } from './supabase.js';
import type { z } from 'zod';
import { messageHistorySchema, messageSendSchema } from './validation.js';

type Envelope = z.infer<typeof messageSendSchema>;
type HistoryRequest = z.infer<typeof messageHistorySchema>;

// SECURITY NOTE (scanner flag "input-trust"): envelope.conversationId /
// senderDeviceId are persisted without re-checking membership/ownership
// here. Reviewed as a false positive for the current call path — the only
// caller, message:send in server.ts, already runs requireConversationMember()
// and requireActiveDevice() before calling this. If a second call site is
// ever added, it MUST perform the same checks first; this function does not
// re-verify on its own.
export async function persistEncryptedMessage(userId: string, envelope: Envelope) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('messages')
    .select('id, created_at')
    .eq('sender_user_id', userId)
    .eq('client_message_id', envelope.clientMessageId)
    .maybeSingle();

  if (existingError) throw new Error('MESSAGE_LOOKUP_FAILED');
  if (existing) return { id: existing.id, createdAt: existing.created_at, duplicate: true as const };

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      client_message_id: envelope.clientMessageId,
      conversation_id: envelope.conversationId,
      sender_user_id: userId,
      sender_device_id: envelope.senderDeviceId,
      algorithm: envelope.algorithm,
      ciphertext: envelope.ciphertext,
      nonce: envelope.nonce ?? null,
      aad: envelope.aad ?? null,
      created_at: envelope.createdAt,
    })
    .select('id, created_at')
    .single();

  if (error || !data) throw new Error('MESSAGE_PERSIST_FAILED');
  return { id: data.id, createdAt: data.created_at, duplicate: false as const };
}

export async function listEncryptedMessages(request: HistoryRequest) {
  let query = supabaseAdmin
    .from('messages')
    .select('id,client_message_id,conversation_id,sender_user_id,sender_device_id,algorithm,ciphertext,nonce,aad,created_at')
    .eq('conversation_id', request.conversationId)
    .order('created_at', { ascending: false })
    .limit(request.limit + 1);

  if (request.before) query = query.lt('created_at', request.before);

  const { data, error } = await query;
  if (error) throw new Error('MESSAGE_HISTORY_FAILED');

  const rows = data ?? [];
  const hasMore = rows.length > request.limit;
  const page = rows.slice(0, request.limit);
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

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
    })),
    nextCursor,
    hasMore,
  };
}
