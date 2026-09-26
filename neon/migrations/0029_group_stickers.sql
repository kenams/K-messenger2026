-- Custom sticker pack per group conversation. Uploaded plain images only (no
-- editor), usable and visible only inside the owning group by its members.
-- Reuses the existing private media pipeline (media_objects, purpose='chat',
-- conversation_id = the group) — no second upload pipeline. The sticker
-- *image itself* is server-visible metadata like an avatar (not E2EE); the
-- message content sending that sticker into the chat still goes through the
-- group's real E2EE the same as any other group message.

create table if not exists public.group_stickers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  media_id uuid not null references public.media_objects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists group_stickers_conversation_idx on public.group_stickers(conversation_id, created_at desc);

alter table public.group_stickers enable row level security;
alter table public.group_stickers force row level security;

-- Visible only to current members of the owning group.
drop policy if exists group_stickers_member_select on public.group_stickers;
create policy group_stickers_member_select
  on public.group_stickers for select to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = group_stickers.conversation_id
         and cm.user_id = auth.user_id()::uuid
    )
  );

-- Insertable only by a current member, uploading their own sticker. The
-- server also enforces the 5-8 pack-size cap (client-trust alone is not
-- enough for a count constraint expressible cleanly in RLS).
drop policy if exists group_stickers_member_insert on public.group_stickers;
create policy group_stickers_member_insert
  on public.group_stickers for insert to authenticated
  with check (
    uploader_id = auth.user_id()::uuid
    and exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = group_stickers.conversation_id
         and cm.user_id = auth.user_id()::uuid
    )
  );

-- Deletable by the uploader or a group owner/moderator (checked server-side
-- against conversation_members.role before issuing the delete; RLS only
-- guards against a non-member reaching the row at all).
drop policy if exists group_stickers_member_delete on public.group_stickers;
create policy group_stickers_member_delete
  on public.group_stickers for delete to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = group_stickers.conversation_id
         and cm.user_id = auth.user_id()::uuid
    )
  );

grant select, insert, delete on public.group_stickers to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.group_stickers from anon;
  end if;
end
$$;
