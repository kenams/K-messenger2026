import { query } from './db.js';

export async function requireConversationMember(userId: string, conversationId: string) {
  const { rowCount } = await query(
    `select 1
       from public.conversation_members
      where conversation_id = $1
        and user_id = $2
      limit 1`,
    [conversationId, userId],
  );
  if (rowCount !== 1) throw new Error('FORBIDDEN');
}

export async function requireActiveDevice(userId: string, deviceId: string) {
  const { rowCount } = await query(
    `select 1
       from public.devices
      where id = $1
        and user_id = $2
        and revoked_at is null
      limit 1`,
    [deviceId, userId],
  );
  if (rowCount !== 1) throw new Error('FORBIDDEN_DEVICE');
}

export async function requireNotBlocked(a: string, b: string) {
  const { rowCount } = await query(
    `select 1
       from public.blocks
      where (blocker_id = $1 and blocked_id = $2)
         or (blocker_id = $2 and blocked_id = $1)
      limit 1`,
    [a, b],
  );
  if ((rowCount ?? 0) > 0) throw new Error('BLOCKED');
}

export async function requireConversationNotBlocked(userId: string, conversationId: string) {
  const { rows: conversationRows } = await query<{ kind: string }>(
    `select kind
       from public.conversations
      where id = $1
      limit 1`,
    [conversationId],
  );
  const conversation = conversationRows[0];
  if (!conversation) throw new Error('FORBIDDEN');

  // Blocking is a hard stop for 1:1 delivery. Group semantics are separate:
  // blocking a member must not silently break the entire group transport.
  if (conversation.kind !== 'direct') return;

  const { rows: members } = await query<{ user_id: string }>(
    `select user_id
       from public.conversation_members
      where conversation_id = $1`,
    [conversationId],
  );
  const memberIds = members.map((row) => row.user_id);
  if (memberIds.length !== 2 || !memberIds.includes(userId)) throw new Error('FORBIDDEN');

  const peerId = memberIds.find((id) => id !== userId);
  if (!peerId) throw new Error('FORBIDDEN');
  await requireNotBlocked(userId, peerId);
}
