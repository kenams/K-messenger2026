-- Real E2EE for group messages (was plaintext-over-TLS only, honestly
-- labelled as such in the UI). Model: one random symmetric key per group
-- conversation (NaCl secretbox), wrapped individually for each member with
-- NaCl box against their existing e2ee.ts identity keypair (same keys direct
-- chat already uses) — server never sees the group key or message content,
-- only opaque per-member wrapped blobs and ciphertext.
--
-- Scope, same honesty as direct E2EE: a member added to the group after key
-- creation gets it opportunistically wrapped by any online existing member's
-- client that notices the gap (group:updated) — not a hard guarantee like a
-- real Signal sender-key distribution protocol. Good enough for "the server
-- can't read your messages", not a claim of forward secrecy.

create table if not exists public.group_keys (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  member_user_id uuid not null references public.profiles(id) on delete cascade,
  wrapped_key text not null,
  wrapped_nonce text not null,
  wrapped_by_public_key text not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, member_user_id)
);

alter table public.group_keys enable row level security;
alter table public.group_keys force row level security;

-- Each device only ever needs to read the wrapping addressed to itself —
-- it can't decrypt anyone else's wrapped copy anyway (wrapped to their
-- public key, not the reader's).
drop policy if exists group_keys_self_select on public.group_keys;
create policy group_keys_self_select
  on public.group_keys for select to authenticated
  using (member_user_id = auth.user_id()::uuid);

-- Only a fellow member of the same conversation may hand out a wrapped copy
-- of the group key (to themselves on first send, or opportunistically to a
-- newer member they see lacks one).
drop policy if exists group_keys_member_insert on public.group_keys;
create policy group_keys_member_insert
  on public.group_keys for insert to authenticated
  with check (
    exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = group_keys.conversation_id
         and cm.user_id = auth.user_id()::uuid
    )
    and exists (
      select 1 from public.conversation_members cm2
       where cm2.conversation_id = group_keys.conversation_id
         and cm2.user_id = group_keys.member_user_id
    )
  );

grant select, insert on public.group_keys to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.group_keys from anon;
  end if;
end
$$;
