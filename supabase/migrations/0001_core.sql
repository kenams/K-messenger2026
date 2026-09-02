create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 32),
  display_name text not null check (char_length(display_name) between 1 and 64),
  avatar_url text,
  bio text,
  custom_status text,
  presence text not null default 'offline' check (presence in ('online','busy','away','invisible','offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  identity_sign_public text not null,
  identity_dh_public text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists devices_user_id_idx on public.devices(user_id);

create table if not exists public.contacts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references auth.users(id) on delete cascade,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(owner_id, contact_id),
  check(owner_id <> contact_id)
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  unique(sender_id, recipient_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check(kind in ('direct','group')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('member','admin','owner')),
  joined_at timestamptz not null default now(),
  primary key(conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_message_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id),
  sender_device_id uuid not null references public.devices(id),
  algorithm text not null,
  ciphertext text not null,
  nonce text,
  aad text,
  created_at timestamptz not null default now(),
  unique(sender_user_id, client_message_id)
);

create table if not exists public.privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_online text not null default 'contacts' check(show_online in ('everyone','contacts','nobody')),
  show_last_seen text not null default 'contacts' check(show_last_seen in ('everyone','contacts','nobody')),
  allow_wizz text not null default 'contacts' check(allow_wizz in ('everyone','contacts','favorites','nobody')),
  allow_location text not null default 'contacts' check(allow_location in ('contacts','favorites','nobody')),
  read_receipts boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.privacy_settings enable row level security;

create policy "profile self update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profile readable authenticated" on public.profiles for select to authenticated using (true);
create policy "device owner access" on public.devices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contacts owner access" on public.contacts for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "request participants read" on public.contact_requests for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "request sender insert" on public.contact_requests for insert with check (auth.uid() = sender_id and sender_id <> recipient_id);
create policy "request participants update" on public.contact_requests for update using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "blocks owner access" on public.blocks for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
create policy "conversation member read" on public.conversations for select using (exists(select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()));
create policy "membership member read" on public.conversation_members for select using (exists(select 1 from public.conversation_members me where me.conversation_id = conversation_id and me.user_id = auth.uid()));
create policy "messages member read" on public.messages for select using (exists(select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()));
create policy "messages member insert" on public.messages for insert with check (
  auth.uid() = sender_user_id
  and exists(select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid())
  and exists(select 1 from public.devices d where d.id = sender_device_id and d.user_id = auth.uid() and d.revoked_at is null)
);
create policy "privacy owner access" on public.privacy_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
