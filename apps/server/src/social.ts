import { query, transaction } from './db.js';
import { requireNotBlocked } from './authorization.js';

type ContactRequestRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: string;
  created_at?: string;
};

type ContactRequestListRow = ContactRequestRow & {
  counterpart_id: string;
  counterpart_username: string;
  counterpart_display_name: string;
};

export async function listContacts(userId: string) {
  const { rows } = await query<{
    contact_id: string;
    favorite: boolean;
    list_name: string;
    id: string;
    username: string;
    display_name: string;
    nickname: string | null;
    avatar_url: string | null;
    custom_status: string | null;
    presence: string;
    now_playing_title: string | null;
    now_playing_artist: string | null;
  }>(
    `select c.contact_id,
            c.favorite,
            c.list_name,
            p.id,
            p.username,
            p.display_name,
            p.nickname,
            p.avatar_url,
            p.custom_status,
            case
              when p.presence = 'invisible' then 'offline'
              when coalesce(ps.show_online, 'contacts') = 'nobody' then 'offline'
              else p.presence
            end as presence,
            case
              when coalesce(ps.show_music, 'contacts') = 'nobody' then null
              else p.now_playing_title
            end as now_playing_title,
            case
              when coalesce(ps.show_music, 'contacts') = 'nobody' then null
              else p.now_playing_artist
            end as now_playing_artist
       from public.contacts c
       join public.profiles p on p.id = c.contact_id
       left join public.privacy_settings ps on ps.user_id = p.id
      where c.owner_id = $1
      order by c.favorite desc, c.list_name asc, p.display_name asc`,
    [userId],
  );

  return rows.map((row) => ({
    contact_id: row.contact_id,
    favorite: row.favorite,
    list_name: row.list_name,
    profiles: {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      nickname: row.nickname,
      avatar_url: row.avatar_url,
      custom_status: row.custom_status,
      presence: row.presence,
      now_playing_title: row.now_playing_title,
      now_playing_artist: row.now_playing_artist,
    },
  }));
}

export async function listContactRequests(userId: string) {
  const { rows } = await query<ContactRequestListRow>(
    `select r.id,
            r.sender_id,
            r.recipient_id,
            r.status,
            r.created_at,
            p.id as counterpart_id,
            p.username as counterpart_username,
            p.display_name as counterpart_display_name
       from public.contact_requests r
       join public.profiles p
         on p.id = case when r.sender_id = $1 then r.recipient_id else r.sender_id end
      where (r.sender_id = $1 or r.recipient_id = $1)
        and r.status = 'pending'
      order by r.created_at desc`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    status: row.status,
    created_at: row.created_at,
    counterpart: {
      id: row.counterpart_id,
      username: row.counterpart_username,
      display_name: row.counterpart_display_name,
    },
  }));
}

export async function searchProfiles(userId: string, searchQuery: string) {
  const trimmed = searchQuery.trim();
  if (trimmed.length < 2) return [];

  const { rows } = await query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    custom_status: string | null;
    presence: string;
  }>(
    `select p.id,
            p.username,
            p.display_name,
            p.avatar_url,
            p.custom_status,
            case
              when p.presence = 'invisible' then 'offline'
              when coalesce(ps.show_online, 'contacts') = 'everyone' then p.presence
              when coalesce(ps.show_online, 'contacts') = 'contacts'
                and exists (
                  select 1
                    from public.contacts c
                   where c.owner_id = $1
                     and c.contact_id = p.id
                ) then p.presence
              else 'offline'
            end as presence
       from public.profiles p
       left join public.privacy_settings ps on ps.user_id = p.id
      where p.id <> $1
        and (p.username ilike $2 or p.display_name ilike $2)
        and not exists (
          select 1
            from public.blocks b
           where (b.blocker_id = $1 and b.blocked_id = p.id)
              or (b.blocker_id = p.id and b.blocked_id = $1)
        )
      order by p.username asc
      limit 20`,
    [userId, `%${trimmed}%`],
  );
  return rows;
}

export async function getContactAudience(userId: string): Promise<string[]> {
  const { rows } = await query<{ contact_id: string }>(
    `select c.contact_id
       from public.contacts c
       left join public.privacy_settings ps on ps.user_id = $1
      where c.owner_id = $1
        and coalesce(ps.show_online, 'contacts') <> 'nobody'`,
    [userId],
  );
  return rows.map((row) => row.contact_id);
}

export async function setPresence(userId: string, status: 'online' | 'busy' | 'away' | 'invisible' | 'offline') {
  await query(
    `update public.profiles
        set presence = $2,
            updated_at = now()
      where id = $1`,
    [userId, status],
  );
}

export async function requestContact(userId: string, recipientId: string) {
  if (userId === recipientId) throw new Error('SELF_CONTACT');
  await requireNotBlocked(userId, recipientId);

  const { rowCount: existingContactCount } = await query(
    `select 1
       from public.contacts
      where owner_id = $1
        and contact_id = $2
      limit 1`,
    [userId, recipientId],
  );
  if (existingContactCount === 1) throw new Error('ALREADY_CONTACT');

  const { rows } = await query<ContactRequestRow>(
    `with inserted as (
       insert into public.contact_requests (sender_id, recipient_id)
       values ($1, $2)
       on conflict do nothing
       returning id, sender_id, recipient_id, status
     )
     select id, sender_id, recipient_id, status from inserted
     union all
     select id, sender_id, recipient_id, status
       from public.contact_requests
      where status = 'pending'
        and (
          (sender_id = $1 and recipient_id = $2)
          or
          (sender_id = $2 and recipient_id = $1)
        )
     limit 1`,
    [userId, recipientId],
  );

  const request = rows[0];
  if (!request) throw new Error('CONTACT_REQUEST_FAILED');
  return request;
}

export async function acceptContact(userId: string, requestId: string) {
  return transaction(async (client) => {
    const { rows } = await client.query<ContactRequestRow>(
      `select id, sender_id, recipient_id, status
         from public.contact_requests
        where id = $1
          and recipient_id = $2
          and status = 'pending'
        for update`,
      [requestId, userId],
    );

    const request = rows[0];
    if (!request) throw new Error('REQUEST_NOT_FOUND');

    const { rowCount: blockCount } = await client.query(
      `select 1
         from public.blocks
        where (blocker_id = $1 and blocked_id = $2)
           or (blocker_id = $2 and blocked_id = $1)
        limit 1`,
      [request.sender_id, request.recipient_id],
    );
    if ((blockCount ?? 0) > 0) throw new Error('BLOCKED');

    await client.query(
      `insert into public.contacts (owner_id, contact_id)
       values ($1, $2), ($2, $1)
       on conflict do nothing`,
      [request.sender_id, request.recipient_id],
    );
    await client.query(
      `update public.contact_requests
          set status = 'accepted',
              updated_at = now()
        where id = $1`,
      [request.id],
    );

    return request;
  });
}

export async function declineContact(userId: string, requestId: string) {
  const { rows } = await query<ContactRequestRow>(
    `update public.contact_requests
        set status = 'declined',
            updated_at = now()
      where id = $1
        and recipient_id = $2
        and status = 'pending'
      returning id, sender_id, recipient_id, status`,
    [requestId, userId],
  );
  const request = rows[0];
  if (!request) throw new Error('REQUEST_NOT_FOUND');
  return request;
}

export async function cancelContactRequest(userId: string, requestId: string) {
  const { rows } = await query<ContactRequestRow>(
    `update public.contact_requests
        set status = 'cancelled',
            updated_at = now()
      where id = $1
        and sender_id = $2
        and status = 'pending'
      returning id, sender_id, recipient_id, status`,
    [requestId, userId],
  );
  const request = rows[0];
  if (!request) throw new Error('REQUEST_NOT_FOUND');
  return request;
}

export async function removeContact(userId: string, contactId: string) {
  if (userId === contactId) throw new Error('SELF_CONTACT');
  await query(
    `delete from public.contacts
      where (owner_id = $1 and contact_id = $2)
         or (owner_id = $2 and contact_id = $1)`,
    [userId, contactId],
  );
}

export async function setFavorite(userId: string, contactId: string, favorite: boolean) {
  const { rows } = await query<{ contact_id: string; favorite: boolean }>(
    `update public.contacts
        set favorite = $3
      where owner_id = $1
        and contact_id = $2
      returning contact_id, favorite`,
    [userId, contactId, favorite],
  );
  const contact = rows[0];
  if (!contact) throw new Error('CONTACT_NOT_FOUND');
  return contact;
}

export async function blockUser(userId: string, blockedId: string) {
  if (userId === blockedId) throw new Error('SELF_BLOCK');

  await transaction(async (client) => {
    await client.query(
      `insert into public.blocks (blocker_id, blocked_id)
       values ($1, $2)
       on conflict do nothing`,
      [userId, blockedId],
    );
    await client.query(
      `delete from public.contacts
        where (owner_id = $1 and contact_id = $2)
           or (owner_id = $2 and contact_id = $1)`,
      [userId, blockedId],
    );
    await client.query(
      `update public.contact_requests
          set status = 'cancelled',
              updated_at = now()
        where status = 'pending'
          and (
            (sender_id = $1 and recipient_id = $2)
            or
            (sender_id = $2 and recipient_id = $1)
          )`,
      [userId, blockedId],
    );
  });
}

export async function listBlockedUsers(userId: string) {
  const { rows } = await query<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    blocked_at: string;
  }>(
    `select p.id,
            p.username,
            p.display_name,
            p.avatar_url,
            b.created_at as blocked_at
       from public.blocks b
       join public.profiles p on p.id = b.blocked_id
      where b.blocker_id = $1
      order by b.created_at desc`,
    [userId],
  );
  return rows;
}

export async function unblockUser(userId: string, blockedId: string) {
  if (userId === blockedId) throw new Error('SELF_BLOCK');

  const { rowCount } = await query(
    `delete from public.blocks
      where blocker_id = $1
        and blocked_id = $2`,
    [userId, blockedId],
  );
  if ((rowCount ?? 0) === 0) throw new Error('BLOCK_NOT_FOUND');
}

export async function canWizz(senderId: string, recipientId: string) {
  await requireNotBlocked(senderId, recipientId);

  const { rows: contactRows } = await query<{ favorite: boolean }>(
    `select favorite
       from public.contacts
      where owner_id = $1
        and contact_id = $2
      limit 1`,
    [recipientId, senderId],
  );
  const { rows: privacyRows } = await query<{ allow_wizz: string }>(
    `select allow_wizz
       from public.privacy_settings
      where user_id = $1
      limit 1`,
    [recipientId],
  );

  const contact = contactRows[0];
  const policy = privacyRows[0]?.allow_wizz ?? 'contacts';
  if (policy === 'nobody') throw new Error('WIZZ_DISABLED');
  if (policy === 'contacts' && !contact) throw new Error('WIZZ_FORBIDDEN');
  if (policy === 'favorites' && !contact?.favorite) throw new Error('WIZZ_FORBIDDEN');
}
