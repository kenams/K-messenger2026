-- Message reactions (❤️ 👍 😂 👊 ✅ …) — one per person per message, toggleable.

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_reactions_message_idx on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;
grant select, insert, update, delete on public.message_reactions to authenticated;

drop policy if exists message_reactions_member_read on public.message_reactions;
create policy message_reactions_member_read on public.message_reactions for select to authenticated
  using (exists (
    select 1 from public.messages m
     where m.id = message_id
       and public.is_conversation_member(m.conversation_id, auth.user_id()::uuid)
  ));

drop policy if exists message_reactions_self_insert on public.message_reactions;
create policy message_reactions_self_insert on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.user_id()::uuid
    and exists (
      select 1 from public.messages m
       where m.id = message_id
         and public.is_conversation_member(m.conversation_id, auth.user_id()::uuid)
    )
  );

drop policy if exists message_reactions_self_update on public.message_reactions;
create policy message_reactions_self_update on public.message_reactions for update to authenticated
  using (user_id = auth.user_id()::uuid)
  with check (user_id = auth.user_id()::uuid);

drop policy if exists message_reactions_self_delete on public.message_reactions;
create policy message_reactions_self_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.user_id()::uuid);
