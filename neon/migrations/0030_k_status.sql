-- K-Statut: 24h ephemeral, friends-only, end-to-end encrypted status.
-- Same crypto idiom as group_keys/groupE2ee.ts: one random NaCl secretbox
-- key encrypts the status text, then that one-time key is wrapped
-- individually via NaCl box for each currently-accepted contact's identity
-- public key. The server only ever sees ciphertext + opaque wrapped keys,
-- never plaintext or the status key itself.
--
-- Honesty note (matches the group-key caveat already documented in
-- 0028_group_e2ee.sql): a contact added *after* the status was posted
-- cannot read it retroactively — no re-wrap-on-new-contact mechanism, same
-- as group keys not being re-wrapped for a member who joined mid-history.
--
-- TTL is enforced twice: the RLS select policy excludes expired rows, and
-- the server additionally hard-deletes past-expiry rows on a periodic timer
-- (see purgeExpiredKStatuses in server.ts) so "expired" is a real deletion,
-- not just a filtered read.

create table if not exists public.k_status (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists k_status_owner_idx on public.k_status(owner_id, created_at desc);
create index if not exists k_status_expires_idx on public.k_status(expires_at);

create table if not exists public.k_status_keys (
  status_id uuid not null references public.k_status(id) on delete cascade,
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  wrapped_key text not null,
  wrapped_nonce text not null,
  wrapped_by_public_key text not null,
  created_at timestamptz not null default now(),
  primary key (status_id, viewer_user_id)
);

create index if not exists k_status_keys_viewer_idx on public.k_status_keys(viewer_user_id);

alter table public.k_status enable row level security;
alter table public.k_status force row level security;
alter table public.k_status_keys enable row level security;
alter table public.k_status_keys force row level security;

-- A status is only readable by its owner or a viewer holding a wrapped key
-- for it (i.e. was an accepted contact at post time), and only while it
-- has not yet expired server-side.
drop policy if exists k_status_owner_or_wrapped_select on public.k_status;
create policy k_status_owner_or_wrapped_select
  on public.k_status for select to authenticated
  using (
    expires_at > now()
    and (
      owner_id = auth.user_id()::uuid
      or exists (
        select 1 from public.k_status_keys ksk
         where ksk.status_id = k_status.id
           and ksk.viewer_user_id = auth.user_id()::uuid
      )
    )
  );

-- Only the owner may post their own status.
drop policy if exists k_status_owner_insert on public.k_status;
create policy k_status_owner_insert
  on public.k_status for insert to authenticated
  with check (owner_id = auth.user_id()::uuid);

-- Owner can delete early ("status:delete").
drop policy if exists k_status_owner_delete on public.k_status;
create policy k_status_owner_delete
  on public.k_status for delete to authenticated
  using (owner_id = auth.user_id()::uuid);

-- Each viewer only ever reads the wrapping addressed to itself (same idiom
-- as group_keys_self_select) — it can't decrypt anyone else's wrapped copy
-- anyway (wrapped to their own public key, not the reader's).
drop policy if exists k_status_keys_self_select on public.k_status_keys;
create policy k_status_keys_self_select
  on public.k_status_keys for select to authenticated
  using (viewer_user_id = auth.user_id()::uuid);

-- Only the status owner may wrap and hand out copies of their own status
-- key (to their own current contacts, at post time).
drop policy if exists k_status_keys_owner_insert on public.k_status_keys;
create policy k_status_keys_owner_insert
  on public.k_status_keys for insert to authenticated
  with check (
    exists (
      select 1 from public.k_status ks
       where ks.id = k_status_keys.status_id
         and ks.owner_id = auth.user_id()::uuid
    )
  );

grant select, insert, delete on public.k_status to authenticated;
grant select, insert on public.k_status_keys to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.k_status from anon;
    revoke all on public.k_status_keys from anon;
  end if;
end
$$;
