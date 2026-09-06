-- K-ssenger V1 account deletion integrity.
--
-- Deleting a Neon Auth user must not be blocked merely because the account has
-- created conversations, sent messages, or performed moderation actions.
-- Preserve shared conversation/moderation records without retaining the deleted
-- user's identity, while removing that user's own encrypted messages.

alter table public.conversations
  alter column created_by drop not null;

alter table public.conversations
  drop constraint if exists conversations_created_by_fkey;

alter table public.conversations
  add constraint conversations_created_by_fkey
  foreign key (created_by)
  references neon_auth."user"(id)
  on delete set null;

alter table public.messages
  drop constraint if exists messages_sender_user_id_fkey;

alter table public.messages
  add constraint messages_sender_user_id_fkey
  foreign key (sender_user_id)
  references neon_auth."user"(id)
  on delete cascade;

alter table public.group_bans
  alter column banned_by drop not null;

alter table public.group_bans
  drop constraint if exists group_bans_banned_by_fkey;

alter table public.group_bans
  add constraint group_bans_banned_by_fkey
  foreign key (banned_by)
  references neon_auth."user"(id)
  on delete set null;
