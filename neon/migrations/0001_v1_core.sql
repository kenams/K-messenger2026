-- K-ssenger dedicated Neon V1 core schema.
-- Uses Neon Auth + Data API JWT context via auth.user_id().
-- This is intentionally separate from the historical Supabase migrations.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references neon_auth."user"(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9._]{3,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 64),
  nickname text check (nickname is null or char_length(nickname) between 1 and 64),
  avatar_url text,
  bio text check (bio is null or char_length(bio) <= 500),
  custom_status text check (custom_status is null or char_length(custom_status) <= 140),
  presence text not null default 'offline' check (presence in ('online','busy','away','invisible','offline')),
  now_playing_title text,
  now_playing_artist text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_settings (
  user_id uuid primary key references neon_auth."user"(id) on delete cascade,
  show_online text not null default 'contacts' check (show_online in ('everyone','contacts','nobody')),
  show_last_seen text not null default 'contacts' check (show_last_seen in ('everyone','contacts','nobody')),
  show_music text not null default 'contacts' check (show_music in ('everyone','contacts','nobody')),
  allow_wizz text not null default 'contacts' check (allow_wizz in ('everyone','contacts','favorites','nobody')),
  allow_location text not null default 'contacts' check (allow_location in ('contacts','favorites','nobody')),
  read_receipts boolean not null default true,
  login_notifications text not null default 'favorites' check (login_notifications in ('all_contacts','favorites','nobody')),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  owner_id uuid not null references neon_auth."user"(id) on delete cascade,
  contact_id uuid not null references neon_auth."user"(id) on delete cascade,
  favorite boolean not null default false,
  list_name text not null default 'Amis' check (char_length(list_name) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references neon_auth."user"(id) on delete cascade,
  recipient_id uuid not null references neon_auth."user"(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create unique index if not exists contact_requests_pending_pair_idx
  on public.contact_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';

create table if not exists public.blocks (
  blocker_id uuid not null references neon_auth."user"(id) on delete cascade,
  blocked_id uuid not null references neon_auth."user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct','group')),
  title text,
  avatar_url text,
  created_by uuid not null references neon_auth."user"(id),
  created_at timestamptz not null default now(),
  check ((kind='direct' and title is null) or (kind='group' and title is not null and char_length(title) between 1 and 80))
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin','owner')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  identity_sign_public text,
  identity_dh_public text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_message_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references neon_auth."user"(id),
  sender_device_id uuid references public.devices(id),
  algorithm text not null check (char_length(algorithm) between 1 and 64),
  ciphertext text not null,
  nonce text,
  aad text,
  created_at timestamptz not null default now(),
  unique (sender_user_id, client_message_id)
);

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, user_id)
);

create index if not exists contacts_owner_idx on public.contacts(owner_id);
create index if not exists contacts_contact_idx on public.contacts(contact_id);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.devices enable row level security;
alter table public.messages enable row level security;
alter table public.message_receipts enable row level security;

create or replace function public.is_contact(viewer uuid, target uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.contacts c where c.owner_id=viewer and c.contact_id=target);
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=p_user_id);
$$;

create policy profiles_self_or_contact_read on public.profiles for select to authenticated
using (id = auth.user_id()::uuid or public.is_contact(auth.user_id()::uuid, id));
create policy profiles_self_insert on public.profiles for insert to authenticated
with check (id = auth.user_id()::uuid);
create policy profiles_self_update on public.profiles for update to authenticated
using (id = auth.user_id()::uuid) with check (id = auth.user_id()::uuid);

create policy privacy_self_all on public.privacy_settings for all to authenticated
using (user_id = auth.user_id()::uuid) with check (user_id = auth.user_id()::uuid);

create policy contacts_self_read on public.contacts for select to authenticated
using (owner_id = auth.user_id()::uuid);
create policy contacts_self_update on public.contacts for update to authenticated
using (owner_id = auth.user_id()::uuid) with check (owner_id = auth.user_id()::uuid);

create policy requests_participant_read on public.contact_requests for select to authenticated
using (sender_id = auth.user_id()::uuid or recipient_id = auth.user_id()::uuid);
create policy requests_sender_insert on public.contact_requests for insert to authenticated
with check (sender_id = auth.user_id()::uuid and sender_id <> recipient_id);

create policy blocks_owner_all on public.blocks for all to authenticated
using (blocker_id = auth.user_id()::uuid) with check (blocker_id = auth.user_id()::uuid);

create policy conversations_member_read on public.conversations for select to authenticated
using (public.is_conversation_member(id, auth.user_id()::uuid));
create policy conversation_members_member_read on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_id, auth.user_id()::uuid));

create policy devices_self_all on public.devices for all to authenticated
using (user_id = auth.user_id()::uuid) with check (user_id = auth.user_id()::uuid);

create policy messages_member_read on public.messages for select to authenticated
using (public.is_conversation_member(conversation_id, auth.user_id()::uuid));
-- Inserts are deliberately backend-controlled until device/E2EE enforcement is moved to Neon-native server code.

create policy receipts_member_read on public.message_receipts for select to authenticated
using (exists(select 1 from public.messages m where m.id=message_id and public.is_conversation_member(m.conversation_id, auth.user_id()::uuid)));

revoke insert, update, delete on public.contacts from authenticated;
revoke update, delete on public.contact_requests from authenticated;
revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.conversation_members from authenticated;
revoke insert, update, delete on public.messages from authenticated;
revoke insert, update, delete on public.message_receipts from authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.privacy_settings to authenticated;
grant select on public.contacts to authenticated;
grant select, insert on public.contact_requests to authenticated;
grant select, insert, update, delete on public.blocks to authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.message_receipts to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
