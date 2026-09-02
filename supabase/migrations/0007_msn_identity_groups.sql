-- MSN 2027 identity: nicknames, now-playing, contact lists and safe group metadata.

alter table public.profiles
  add column if not exists nickname text,
  add column if not exists now_playing_title text,
  add column if not exists now_playing_artist text,
  add column if not exists now_playing_updated_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_nickname_length;
alter table public.profiles
  add constraint profiles_nickname_length check (nickname is null or char_length(nickname) between 1 and 64);

alter table public.contacts
  add column if not exists list_name text not null default 'Amis';

alter table public.contacts
  drop constraint if exists contacts_list_name_length;
alter table public.contacts
  add constraint contacts_list_name_length check (char_length(list_name) between 1 and 32);

alter table public.privacy_settings
  add column if not exists show_music text not null default 'contacts'
    check(show_music in ('everyone','contacts','nobody')),
  add column if not exists login_notifications text not null default 'favorites'
    check(login_notifications in ('all_contacts','favorites','nobody'));

alter table public.conversations
  add column if not exists title text,
  add column if not exists avatar_url text;

alter table public.conversations
  drop constraint if exists conversations_group_title;
alter table public.conversations
  add constraint conversations_group_title check (
    (kind = 'direct' and title is null)
    or (kind = 'group' and title is not null and char_length(title) between 1 and 80)
  );

create table if not exists public.group_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  description text check(description is null or char_length(description) <= 500),
  allow_member_wizz boolean not null default true,
  allow_member_invites boolean not null default false,
  allow_member_moments boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.group_settings enable row level security;

create policy "group settings member read"
on public.group_settings for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "group settings admin update"
on public.group_settings for update to authenticated
using (
  exists(
    select 1 from public.conversation_members cm
    where cm.conversation_id = group_settings.conversation_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner','admin')
  )
)
with check (
  exists(
    select 1 from public.conversation_members cm
    where cm.conversation_id = group_settings.conversation_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner','admin')
  )
);

-- Only service/backend group creation for now; prevents clients creating arbitrary
-- settings rows before conversation authorization is fully centralized.
revoke insert, delete on public.group_settings from authenticated;

create index if not exists contacts_owner_list_idx on public.contacts(owner_id, list_name);
create index if not exists profiles_now_playing_idx on public.profiles(now_playing_updated_at) where now_playing_updated_at is not null;
