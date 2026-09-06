import { transaction } from './db.js';

export async function createOrGetDirectConversation(userId: string, contactId: string) {
  if (userId === contactId) throw new Error('SELF_CONVERSATION');
  const pair = [userId, contactId].sort();

  return transaction(async (client) => {
    // Serialize creation for this user pair without requiring a schema change.
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`kssenger:direct:${pair[0]}:${pair[1]}`]);

    const { rowCount: contactCount } = await client.query(
      `select 1
         from public.contacts
        where owner_id = $1
          and contact_id = $2
        limit 1`,
      [userId, contactId],
    );
    if (contactCount !== 1) throw new Error('DIRECT_PEER_MUST_BE_CONTACT');

    const { rowCount: blockCount } = await client.query(
      `select 1
         from public.blocks
        where (blocker_id = $1 and blocked_id = $2)
           or (blocker_id = $2 and blocked_id = $1)
        limit 1`,
      [userId, contactId],
    );
    if ((blockCount ?? 0) > 0) throw new Error('BLOCKED');

    const { rows: existingRows } = await client.query<{ id: string }>(
      `select c.id
         from public.conversations c
         join public.conversation_members a
           on a.conversation_id = c.id and a.user_id = $1
         join public.conversation_members b
           on b.conversation_id = c.id and b.user_id = $2
        where c.kind = 'direct'
          and (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
        order by c.created_at asc
        limit 1`,
      [userId, contactId],
    );
    if (existingRows[0]) return { conversationId: existingRows[0].id, created: false };

    const { rows: conversationRows } = await client.query<{ id: string }>(
      `insert into public.conversations (kind, created_by)
       values ('direct', $1)
       returning id`,
      [userId],
    );
    const conversationId = conversationRows[0]?.id;
    if (!conversationId) throw new Error('DIRECT_CONVERSATION_CREATE_FAILED');

    await client.query(
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member'), ($1, $3, 'member')`,
      [conversationId, userId, contactId],
    );

    return { conversationId, created: true };
  });
}
