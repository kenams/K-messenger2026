import { supabaseAdmin } from './supabase.js';

export type ReceiptState = 'delivered' | 'read';

export async function markMessageReceipt(
  userId: string,
  input: { messageId: string; conversationId: string; state: ReceiptState },
) {
  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .select('id,conversation_id,sender_user_id')
    .eq('id', input.messageId)
    .maybeSingle();

  if (messageError || !message) throw new Error('MESSAGE_NOT_FOUND');
  if (message.conversation_id !== input.conversationId) throw new Error('RECEIPT_CONVERSATION_MISMATCH');
  if (message.sender_user_id === userId) throw new Error('SELF_RECEIPT_FORBIDDEN');

  const now = new Date().toISOString();
  const values = input.state === 'read'
    ? { message_id: input.messageId, user_id: userId, delivered_at: now, read_at: now }
    : { message_id: input.messageId, user_id: userId, delivered_at: now };

  const { data, error } = await supabaseAdmin
    .from('message_receipts')
    .upsert(values, { onConflict: 'message_id,user_id' })
    .select('message_id,user_id,delivered_at,read_at')
    .single();

  if (error || !data) throw new Error('RECEIPT_PERSIST_FAILED');
  return data;
}
