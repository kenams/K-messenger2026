import { transaction } from './db.js';

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
