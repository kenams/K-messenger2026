import type { PoolClient } from 'pg';
import { query, transaction } from './db.js';

type GroupRole = 'member' | 'admin' | 'owner';

async function requireModerator(client: PoolClient, actorId: string, conversationId: string) {
  const { rows } = await client.query<{ role: GroupRole }>(
    `select cm.role
       from public.conversation_members cm
       join public.conversations c on c.id = cm.conversation_id
      where cm.conversation_id = $1
        and cm.user_id = $2
        and c.kind = 'group'
      for update of cm`,
    [conversationId, actorId],
  );
  const role = rows[0]?.role;
  if (role !== 'owner' && role !== 'admin') throw new Error('GROUP_ADMIN_REQUIRED');
  return role;
}

async function requireModeratableTarget(
  client: PoolClient,
  actorRole: GroupRole,
  conversationId: string,
  targetId: string,
) {
  const { rows } = await client.query<{ role: GroupRole }>(
    `select role
       from public.conversation_members
      where conversation_id = $1 and user_id = $2
      for update`,
    [conversationId, targetId],
  );
  const targetRole = rows[0]?.role;
  if (!targetRole) throw new Error('GROUP_TARGET_NOT_MEMBER');
  if (targetRole === 'owner') throw new Error('GROUP_OWNER_IMMUTABLE');
  if (actorRole === 'admin' && targetRole !== 'member') throw new Error('GROUP_OWNER_REQUIRED');
  return targetRole;
}

export async function setGroupMute(
  actorId: string,
  conversationId: string,
  targetId: string,
  mutedUntil: Date | null,
) {
  if (actorId === targetId) throw new Error('GROUP_SELF_MODERATION_REJECTED');
  return transaction(async (client) => {
    const actorRole = await requireModerator(client, actorId, conversationId);
    await requireModeratableTarget(client, actorRole, conversationId, targetId);
    const result = await client.query<{ muted_until: Date | null }>(
      `update public.conversation_members
          set muted_until = $3
        where conversation_id = $1 and user_id = $2
        returning muted_until`,
      [conversationId, targetId, mutedUntil],
    );
    if ((result.rowCount ?? 0) !== 1) throw new Error('GROUP_MUTE_CONFLICT');
    return { conversationId, userId: targetId, mutedUntil: result.rows[0]?.muted_until ?? null };
  });
}

export async function banGroupMember(
  actorId: string,
  conversationId: string,
  targetId: string,
  reason: string | null,
) {
  if (actorId === targetId) throw new Error('GROUP_SELF_MODERATION_REJECTED');
  return transaction(async (client) => {
    const actorRole = await requireModerator(client, actorId, conversationId);
    await requireModeratableTarget(client, actorRole, conversationId, targetId);
    await client.query(
      `insert into public.group_bans (conversation_id, user_id, banned_by, reason)
       values ($1, $2, $3, $4)
       on conflict (conversation_id, user_id)
       do update set banned_by = excluded.banned_by, reason = excluded.reason, created_at = now()`,
      [conversationId, targetId, actorId, reason],
    );
    const removed = await client.query(
      `delete from public.conversation_members
        where conversation_id = $1 and user_id = $2`,
      [conversationId, targetId],
    );
    if ((removed.rowCount ?? 0) !== 1) throw new Error('GROUP_BAN_CONFLICT');
    return { conversationId, userId: targetId };
  });
}

export async function unbanGroupMember(actorId: string, conversationId: string, targetId: string) {
  return transaction(async (client) => {
    await requireModerator(client, actorId, conversationId);
    const removed = await client.query(
      `delete from public.group_bans where conversation_id = $1 and user_id = $2`,
      [conversationId, targetId],
    );
    return { conversationId, userId: targetId, removed: (removed.rowCount ?? 0) === 1 };
  });
}

export async function requireGroupCanSend(userId: string, conversationId: string) {
  const { rows } = await query<{ kind: 'direct' | 'group'; muted_until: Date | null }>(
    `select c.kind, cm.muted_until
       from public.conversations c
       join public.conversation_members cm on cm.conversation_id = c.id
      where c.id = $1 and cm.user_id = $2`,
    [conversationId, userId],
  );
  const membership = rows[0];
  if (!membership) throw new Error('CONVERSATION_MEMBERSHIP_REQUIRED');
  if (membership.kind === 'group' && membership.muted_until && membership.muted_until.getTime() > Date.now()) {
    throw new Error('GROUP_MEMBER_MUTED');
  }
}
