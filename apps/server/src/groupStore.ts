import type { PoolClient } from 'pg';
import { transaction } from './db.js';

type GroupRole = 'member' | 'admin' | 'owner';

async function requireGroupActor(client: PoolClient, actorId: string, conversationId: string) {
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
  if (!role) throw new Error('GROUP_ACTOR_NOT_MEMBER');
  return role;
}

async function requireTargetMember(client: PoolClient, conversationId: string, userId: string) {
  const { rows } = await client.query<{ role: GroupRole }>(
    `select role
       from public.conversation_members
      where conversation_id = $1
        and user_id = $2
      for update`,
    [conversationId, userId],
  );
  const role = rows[0]?.role;
  if (!role) throw new Error('GROUP_TARGET_NOT_MEMBER');
  return role;
}

export async function createGroup(ownerId: string, title: string, memberIds: string[]) {
  if (memberIds.includes(ownerId)) throw new Error('OWNER_DUPLICATED_IN_MEMBERS');

  return transaction(async (client) => {
    const { rows: contactRows } = await client.query<{ contact_id: string }>(
      `select contact_id
         from public.contacts
        where owner_id = $1
          and contact_id = any($2::uuid[])`,
      [ownerId, memberIds],
    );
    const contactSet = new Set(contactRows.map((row) => row.contact_id));
    if (memberIds.some((id) => !contactSet.has(id))) throw new Error('GROUP_MEMBERS_MUST_BE_CONTACTS');

    const { rowCount: blockCount } = await client.query(
      `select 1
         from public.blocks
        where (blocker_id = $1 and blocked_id = any($2::uuid[]))
           or (blocked_id = $1 and blocker_id = any($2::uuid[]))
        limit 1`,
      [ownerId, memberIds],
    );
    if ((blockCount ?? 0) > 0) throw new Error('GROUP_MEMBER_BLOCKED');

    const { rows: conversationRows } = await client.query<{ id: string }>(
      `insert into public.conversations (kind, title, created_by)
       values ('group', $1, $2)
       returning id`,
      [title, ownerId],
    );
    const conversationId = conversationRows[0]?.id;
    if (!conversationId) throw new Error('GROUP_CREATE_FAILED');

    await client.query(
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'owner')`,
      [conversationId, ownerId],
    );
    await client.query(
      `insert into public.conversation_members (conversation_id, user_id, role)
       select $1, member_id, 'member'
         from unnest($2::uuid[]) as member_id`,
      [conversationId, memberIds],
    );

    return { conversationId, title, memberIds };
  });
}

export async function addGroupMember(actorId: string, conversationId: string, memberId: string) {
  if (actorId === memberId) throw new Error('GROUP_SELF_ADD_REJECTED');
  return transaction(async (client) => {
    const actorRole = await requireGroupActor(client, actorId, conversationId);
    if (actorRole !== 'owner' && actorRole !== 'admin') throw new Error('GROUP_ADMIN_REQUIRED');

    const { rowCount: existingCount } = await client.query(
      `select 1 from public.conversation_members where conversation_id = $1 and user_id = $2`,
      [conversationId, memberId],
    );
    if ((existingCount ?? 0) > 0) throw new Error('GROUP_MEMBER_ALREADY_PRESENT');

    const { rowCount: contactCount } = await client.query(
      `select 1 from public.contacts where owner_id = $1 and contact_id = $2`,
      [actorId, memberId],
    );
    if ((contactCount ?? 0) !== 1) throw new Error('GROUP_INVITE_MUST_BE_CONTACT');

    const { rowCount: blockCount } = await client.query(
      `select 1
         from public.blocks b
        where (
          b.blocker_id = $2
          and b.blocked_id in (select user_id from public.conversation_members where conversation_id = $1)
        ) or (
          b.blocked_id = $2
          and b.blocker_id in (select user_id from public.conversation_members where conversation_id = $1)
        )
        limit 1`,
      [conversationId, memberId],
    );
    if ((blockCount ?? 0) > 0) throw new Error('GROUP_MEMBER_BLOCKED');

    await client.query(
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member')`,
      [conversationId, memberId],
    );
    return { conversationId, memberId, role: 'member' as const };
  });
}

export async function removeGroupMember(actorId: string, conversationId: string, memberId: string) {
  if (actorId === memberId) throw new Error('USE_GROUP_LEAVE');
  return transaction(async (client) => {
    const actorRole = await requireGroupActor(client, actorId, conversationId);
    if (actorRole !== 'owner' && actorRole !== 'admin') throw new Error('GROUP_ADMIN_REQUIRED');
    const targetRole = await requireTargetMember(client, conversationId, memberId);
    if (targetRole === 'owner') throw new Error('GROUP_OWNER_CANNOT_BE_REMOVED');
    if (actorRole === 'admin' && targetRole !== 'member') throw new Error('GROUP_OWNER_REQUIRED');

    await client.query(
      `delete from public.conversation_members where conversation_id = $1 and user_id = $2`,
      [conversationId, memberId],
    );
    return { conversationId, memberId };
  });
}

export async function setGroupMemberRole(
  actorId: string,
  conversationId: string,
  memberId: string,
  role: Exclude<GroupRole, 'owner'>,
) {
  if (actorId === memberId) throw new Error('GROUP_OWNER_ROLE_IMMUTABLE');
  return transaction(async (client) => {
    const actorRole = await requireGroupActor(client, actorId, conversationId);
    if (actorRole !== 'owner') throw new Error('GROUP_OWNER_REQUIRED');
    const targetRole = await requireTargetMember(client, conversationId, memberId);
    if (targetRole === 'owner') throw new Error('GROUP_OWNER_ROLE_IMMUTABLE');

    await client.query(
      `update public.conversation_members
          set role = $3
        where conversation_id = $1
          and user_id = $2`,
      [conversationId, memberId, role],
    );
    return { conversationId, memberId, role };
  });
}

export async function leaveGroup(userId: string, conversationId: string) {
  return transaction(async (client) => {
    const role = await requireGroupActor(client, userId, conversationId);
    if (role === 'owner') throw new Error('GROUP_OWNER_MUST_TRANSFER_OWNERSHIP');
    await client.query(
      `delete from public.conversation_members where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    return { conversationId, userId };
  });
}
