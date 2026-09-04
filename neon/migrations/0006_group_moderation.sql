-- K-ssenger group moderation state.
-- Backend-controlled only: authenticated clients may read moderation state for
-- groups they belong to, but cannot directly mute/ban or bypass group roles.

alter table public.conversation_members
  add column if not exists muted_until timestamptz;

create table if not exists public.group_bans (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  banned_by uuid not null references neon_auth."user"(id),
  reason text check (reason is null or char_length(reason) <= 240),
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  check (user_id <> banned_by)
);

create index if not exists group_bans_user_idx on public.group_bans(user_id);

alter table public.group_bans enable row level security;

create policy group_bans_member_read on public.group_bans for select to authenticated
using (public.is_conversation_member(conversation_id, auth.user_id()::uuid));

revoke insert, update, delete on public.group_bans from authenticated;
grant select on public.group_bans to authenticated;
