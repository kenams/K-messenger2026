-- K-ssenger schema — ciphertext-only. No plaintext, no private keys, ever.
-- NOT applied to any live project yet (no Supabase project created for
-- k-ssenger). Written for review before Phase D actually provisions it.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_emoji text,
  created_at timestamptz not null default now()
);

create table if not exists devices (
  device_id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('ios','android','web')),
  name text not null,
  identity_signing_public_key text not null, -- base64 Ed25519, public only
  identity_agreement_public_key text not null, -- base64 X25519, public only
  protocol_version int not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists device_prekeys (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references devices(device_id) on delete cascade,
  prekey_public text not null, -- base64, public only
  signature text not null,     -- base64, signed by the device's identity key
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  owner_id uuid not null references profiles(id) on delete cascade,
  contact_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id)
);

create table if not exists contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references profiles(id) on delete cascade,
  to_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now()
);

create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct','group')),
  created_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_device_id text not null references devices(device_id),
  ciphertext text not null,      -- base64, opaque
  nonce text not null,           -- base64
  protocol_version int not null,
  associated_data text,          -- base64, opaque, optional
  sent_at timestamptz not null default now(),
  state text not null default 'sent' check (state in ('sent','delivered','read'))
);

create table if not exists message_recipients (
  message_id uuid not null references messages(id) on delete cascade,
  recipient_device_id text not null references devices(device_id),
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, recipient_device_id)
);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  storage_path text not null,  -- points to an encrypted blob only
  mime_hint text,               -- e.g. "image", never derived from plaintext content
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists push_tokens (
  user_id uuid not null references profiles(id) on delete cascade,
  device_id text not null references devices(device_id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  primary key (device_id)
);

-- RLS -----------------------------------------------------------------

alter table profiles enable row level security;
alter table devices enable row level security;
alter table device_prekeys enable row level security;
alter table contacts enable row level security;
alter table contact_requests enable row level security;
alter table blocks enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table message_recipients enable row level security;
alter table attachments enable row level security;
alter table push_tokens enable row level security;

create policy "own profile readable by self and contacts" on profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from contacts c where c.owner_id = auth.uid() and c.contact_id = profiles.id)
  );

create policy "own devices manageable by owner" on devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "prekeys readable by anyone, writable by owning device's user" on device_prekeys
  for select using (true);
create policy "prekeys insert by owning user" on device_prekeys
  for insert with check (
    exists (select 1 from devices d where d.device_id = device_prekeys.device_id and d.user_id = auth.uid())
  );

create policy "contacts owned by self" on contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "contact requests visible to sender/recipient" on contact_requests
  for select using (from_id = auth.uid() or to_id = auth.uid());
create policy "contact requests created by sender" on contact_requests
  for insert with check (from_id = auth.uid());

create policy "blocks owned by self" on blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "conversation members only" on conversations
  for select using (
    exists (select 1 from conversation_members m where m.conversation_id = conversations.id and m.user_id = auth.uid())
  );

create policy "own membership rows" on conversation_members
  for select using (user_id = auth.uid());

-- Core invariant: a user can never read ciphertext from a conversation
-- they are not a member of.
create policy "messages readable only by conversation members" on messages
  for select using (
    exists (
      select 1 from conversation_members m
      where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()
    )
  );

create policy "messages insertable only by conversation members" on messages
  for insert with check (
    exists (
      select 1 from conversation_members m
      where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()
    )
  );

create policy "message_recipients own device only" on message_recipients
  for select using (
    exists (select 1 from devices d where d.device_id = message_recipients.recipient_device_id and d.user_id = auth.uid())
  );

create policy "attachments follow parent message visibility" on attachments
  for select using (
    exists (
      select 1 from messages msg
      join conversation_members m on m.conversation_id = msg.conversation_id
      where msg.id = attachments.message_id and m.user_id = auth.uid()
    )
  );

create policy "push tokens owned by self" on push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
