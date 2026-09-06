-- K-ssenger web/mobile device linking (WhatsApp-Web-style relay).
--
-- The web client never touches Signal Protocol keys. A device_links row
-- represents one pairing between a user's phone (the only libsignal
-- participant) and a web session, identified opaquely by link_id. The row
-- only ever stores public ECDH keys and pairing state, never plaintext or
-- ciphertext content — message relay itself happens over the socket layer,
-- not through this table.

create table if not exists public.device_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  web_public_key text not null,
  phone_public_key text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  revoked_at timestamptz
);

create index if not exists device_links_user_status_idx
  on public.device_links (user_id, status);

alter table public.device_links enable row level security;
alter table public.device_links force row level security;

drop policy if exists device_links_self_select on public.device_links;
create policy device_links_self_select
  on public.device_links for select to authenticated
  using (user_id = auth.user_id()::uuid);

drop policy if exists device_links_self_insert on public.device_links;
create policy device_links_self_insert
  on public.device_links for insert to authenticated
  with check (user_id = auth.user_id()::uuid);

drop policy if exists device_links_self_update on public.device_links;
create policy device_links_self_update
  on public.device_links for update to authenticated
  using (user_id = auth.user_id()::uuid)
  with check (user_id = auth.user_id()::uuid);

drop policy if exists device_links_self_delete on public.device_links;
create policy device_links_self_delete
  on public.device_links for delete to authenticated
  using (user_id = auth.user_id()::uuid);

grant select, insert, update, delete on public.device_links to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.device_links from anon;
  end if;
end
$$;
