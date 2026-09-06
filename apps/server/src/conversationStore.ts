import { query } from './db.js';

export async function listConversations(userId: string) {
  const { rows } = await query<{
    id: string;
    kind: 'direct' | 'group';
    title: string | null;
    avatar_url: string | null;
    role: 'member' | 'admin' | 'owner';
    created_at: string;
    last_message_id: string | null;
    last_message_sender_user_id: string | null;
    last_message_created_at: string | null;
    members: unknown;
  }>(
    `select c.id,
            c.kind,
            c.title,
            c.avatar_url,
            self.role,
            c.created_at,
            last_message.id as last_message_id,
            last_message.sender_user_id as last_message_sender_user_id,
            last_message.created_at as last_message_created_at,
            coalesce(
              json_agg(
                json_build_object(
                  'userId', p.id,
                  'username', p.username,
                  'displayName', p.display_name,
                  'nickname', p.nickname,
                  'avatarUrl', p.avatar_url,
                  'presence', case when p.presence = 'invisible' then 'offline' else p.presence end,
                  'role', all_members.role
                )
                order by p.display_name asc
              ) filter (where p.id is not null),
              '[]'::json
            ) as members
       from public.conversation_members self
       join public.conversations c on c.id = self.conversation_id
       join public.conversation_members all_members on all_members.conversation_id = c.id
       join public.profiles p on p.id = all_members.user_id
       left join lateral (
         select id, sender_user_id, created_at
           from public.messages
          where conversation_id = c.id
          order by created_at desc
          limit 1
       ) last_message on true
      where self.user_id = $1
      group by c.id,
               c.kind,
               c.title,
               c.avatar_url,
               self.role,
               c.created_at,
               last_message.id,
               last_message.sender_user_id,
               last_message.created_at
      order by coalesce(last_message.created_at, c.created_at) desc`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          senderUserId: row.last_message_sender_user_id,
          createdAt: row.last_message_created_at,
        }
      : null,
    members: Array.isArray(row.members) ? row.members : [],
  }));
}
