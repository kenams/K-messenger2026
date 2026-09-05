import { query } from './db.js';

export type ReceiptState = 'delivered' | 'read';

export async function markMessageReceipt(
  userId: string,
  input: { messageId: string; conversationId: string; state: ReceiptState },
) {
  const { rows: messageRows } = await query<{
    id: string;
    conversation_id: string;
    sender_user_id: string;
    read_receipts: boolean;
  }>(
    `select m.id,
            m.conversation_id,
            m.sender_user_id,
            coalesce(ps.read_receipts, true) as read_receipts
       from public.messages m
       join public.conversation_members cm
         on cm.conversation_id = m.conversation_id
        and cm.user_id = $2
       left join public.privacy_settings ps
         on ps.user_id = $2
      where m.id = $1
      limit 1`,
    [input.messageId, userId],
  );

  const message = messageRows[0];
  if (!message) throw new Error('MESSAGE_NOT_FOUND_OR_FORBIDDEN');
  if (message.conversation_id !== input.conversationId) throw new Error('RECEIPT_CONVERSATION_MISMATCH');
  if (message.sender_user_id === userId) throw new Error('SELF_RECEIPT_FORBIDDEN');

  // Privacy is enforced at the persistence boundary, not trusted to each UI.
  // A client may ask for "read", but when the authenticated user's setting is
  // disabled we persist only delivery. This gives direct and group chats the
  // same fail-closed behavior and prevents a future client from bypassing it.
  const effectiveState: ReceiptState = input.state === 'read' && !message.read_receipts ? 'delivered' : input.state;
  const now = new Date().toISOString();
  const readAt = effectiveState === 'read' ? now : null;
  const { rows } = await query<{
    message_id: string;
    user_id: string;
    delivered_at: string | null;
    read_at: string | null;
  }>(
    `insert into public.message_receipts (message_id, user_id, delivered_at, read_at)
     select $1, $2, $3, $4
      where exists (
        select 1
          from public.conversation_members cm
         where cm.conversation_id = $5
           and cm.user_id = $2
      )
     on conflict (message_id, user_id) do update set
       delivered_at = coalesce(public.message_receipts.delivered_at, excluded.delivered_at),
       read_at = case
         when excluded.read_at is null then public.message_receipts.read_at
         else coalesce(public.message_receipts.read_at, excluded.read_at)
       end
     returning message_id, user_id, delivered_at, read_at`,
    [input.messageId, userId, now, readAt, input.conversationId],
  );

  const receipt = rows[0];
  if (!receipt) throw new Error('RECEIPT_MEMBERSHIP_REQUIRED');
  return receipt;
}
