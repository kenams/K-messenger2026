import { supabaseAdmin } from './supabase.js';
import type { z } from 'zod';
import { messageSendSchema } from './validation.js';

type Envelope = z.infer<typeof messageSendSchema>;

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
