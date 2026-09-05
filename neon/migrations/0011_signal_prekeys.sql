-- K-ssenger Signal/libsignal PQXDH public-key distribution layer.
-- This migration stores PUBLIC key material only. Private keys never leave a device.
-- One-time EC/PQ prekeys are consumed atomically by claim_signal_prekey_bundle().

create table if not exists public.device_key_bundles (
  device_id uuid primary key references public.devices(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  bundle_version integer not null default 1 check (bundle_version > 0),
  registration_id integer not null check (registration_id between 1 and 16380),
  identity_key text not null check (char_length(identity_key) between 32 and 4096),
  signed_prekey_id integer not null check (signed_prekey_id >= 0),
  signed_prekey_public text not null check (char_length(signed_prekey_public) between 32 and 4096),
  signed_prekey_signature text not null check (char_length(signed_prekey_signature) between 32 and 4096),
  pq_last_resort_prekey_id integer not null check (pq_last_resort_prekey_id >= 0),
  pq_last_resort_prekey_public text not null check (char_length(pq_last_resort_prekey_public) between 32 and 16384),
  pq_last_resort_prekey_signature text not null check (char_length(pq_last_resort_prekey_signature) between 32 and 4096),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(device_id, bundle_version)
);

create table if not exists public.device_one_time_prekeys (
  device_id uuid not null references public.devices(id) on delete cascade,
  key_id integer not null check (key_id >= 0),
  public_key text not null check (char_length(public_key) between 32 and 4096),
  claimed_at timestamptz,
  claimed_by uuid references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(device_id, key_id),
  check ((claimed_at is null) = (claimed_by is null))
);

create table if not exists public.device_pq_one_time_prekeys (
  device_id uuid not null references public.devices(id) on delete cascade,
  key_id integer not null check (key_id >= 0),
  public_key text not null check (char_length(public_key) between 32 and 16384),
  signature text not null check (char_length(signature) between 32 and 4096),
  claimed_at timestamptz,
  claimed_by uuid references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(device_id, key_id),
  check ((claimed_at is null) = (claimed_by is null))
);

create table if not exists public.device_prekey_claims (
  claimer_id uuid not null references neon_auth."user"(id) on delete cascade,
  target_device_id uuid not null references public.devices(id) on delete cascade,
  bundle_version integer not null check (bundle_version > 0),
  claimed_at timestamptz not null default now(),
  primary key(claimer_id, target_device_id, bundle_version)
);

create index if not exists device_key_bundles_user_idx on public.device_key_bundles(user_id, device_id);
create index if not exists device_one_time_prekeys_available_idx on public.device_one_time_prekeys(device_id, key_id) where claimed_at is null;
create index if not exists device_pq_one_time_prekeys_available_idx on public.device_pq_one_time_prekeys(device_id, key_id) where claimed_at is null;

alter table public.device_key_bundles enable row level security;
alter table public.device_one_time_prekeys enable row level security;
alter table public.device_pq_one_time_prekeys enable row level security;
alter table public.device_prekey_claims enable row level security;
alter table public.device_key_bundles force row level security;
alter table public.device_one_time_prekeys force row level security;
alter table public.device_pq_one_time_prekeys force row level security;
alter table public.device_prekey_claims force row level security;

create or replace function public.owns_active_device(p_device_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.devices d
    where d.id=p_device_id and d.user_id=p_user_id and d.revoked_at is null
  );
$$;

create policy key_bundle_owner_all on public.device_key_bundles
for all to authenticated
using (user_id=auth.user_id()::uuid and public.owns_active_device(device_id, auth.user_id()::uuid))
with check (user_id=auth.user_id()::uuid and public.owns_active_device(device_id, auth.user_id()::uuid));

create policy ec_prekeys_owner_read on public.device_one_time_prekeys
for select to authenticated
using (public.owns_active_device(device_id, auth.user_id()::uuid));
create policy ec_prekeys_owner_insert on public.device_one_time_prekeys
for insert to authenticated
with check (public.owns_active_device(device_id, auth.user_id()::uuid) and claimed_at is null and claimed_by is null);
create policy ec_prekeys_owner_delete_unused on public.device_one_time_prekeys
for delete to authenticated
using (public.owns_active_device(device_id, auth.user_id()::uuid) and claimed_at is null);

create policy pq_prekeys_owner_read on public.device_pq_one_time_prekeys
for select to authenticated
using (public.owns_active_device(device_id, auth.user_id()::uuid));
create policy pq_prekeys_owner_insert on public.device_pq_one_time_prekeys
for insert to authenticated
with check (public.owns_active_device(device_id, auth.user_id()::uuid) and claimed_at is null and claimed_by is null);
create policy pq_prekeys_owner_delete_unused on public.device_pq_one_time_prekeys
for delete to authenticated
using (public.owns_active_device(device_id, auth.user_id()::uuid) and claimed_at is null);

create policy prekey_claims_self_read on public.device_prekey_claims
for select to authenticated
using (claimer_id=auth.user_id()::uuid);

create or replace function public.claim_signal_prekey_bundle(p_device_id uuid)
returns table (
  device_id uuid,
  user_id uuid,
  registration_id integer,
  identity_key text,
  signed_prekey_id integer,
  signed_prekey_public text,
  signed_prekey_signature text,
  one_time_prekey_id integer,
  one_time_prekey_public text,
  pq_prekey_id integer,
  pq_prekey_public text,
  pq_prekey_signature text,
  pq_is_last_resort boolean,
  bundle_version integer
)
language plpgsql volatile security definer set search_path=public as $$
declare
  v_viewer uuid := auth.user_id()::uuid;
  v_bundle public.device_key_bundles%rowtype;
  v_ec public.device_one_time_prekeys%rowtype;
  v_pq public.device_pq_one_time_prekeys%rowtype;
begin
  if v_viewer is null then raise exception 'UNAUTHENTICATED'; end if;

  select b.* into v_bundle
    from public.device_key_bundles b
    join public.devices d on d.id=b.device_id
   where b.device_id=p_device_id and d.revoked_at is null;
  if not found then raise exception 'KEY_BUNDLE_NOT_FOUND'; end if;
  if v_bundle.user_id=v_viewer then raise exception 'SELF_PREKEY_CLAIM_FORBIDDEN'; end if;
  if not public.is_contact(v_viewer, v_bundle.user_id) then raise exception 'NOT_CONTACTS'; end if;
  if not public.not_blocked(v_viewer, v_bundle.user_id) then raise exception 'BLOCKED'; end if;

  insert into public.device_prekey_claims(claimer_id,target_device_id,bundle_version)
  values(v_viewer,p_device_id,v_bundle.bundle_version);

  select p.* into v_ec
    from public.device_one_time_prekeys p
   where p.device_id=p_device_id and p.claimed_at is null
   order by p.key_id
   for update skip locked limit 1;
  if found then
    update public.device_one_time_prekeys
       set claimed_at=now(), claimed_by=v_viewer
     where device_id=v_ec.device_id and key_id=v_ec.key_id;
  end if;

  select p.* into v_pq
    from public.device_pq_one_time_prekeys p
   where p.device_id=p_device_id and p.claimed_at is null
   order by p.key_id
   for update skip locked limit 1;
  if found then
    update public.device_pq_one_time_prekeys
       set claimed_at=now(), claimed_by=v_viewer
     where device_id=v_pq.device_id and key_id=v_pq.key_id;
  end if;

  return query select
    v_bundle.device_id,
    v_bundle.user_id,
    v_bundle.registration_id,
    v_bundle.identity_key,
    v_bundle.signed_prekey_id,
    v_bundle.signed_prekey_public,
    v_bundle.signed_prekey_signature,
    case when v_ec.device_id is null then null else v_ec.key_id end,
    case when v_ec.device_id is null then null else v_ec.public_key end,
    coalesce(v_pq.key_id, v_bundle.pq_last_resort_prekey_id),
    coalesce(v_pq.public_key, v_bundle.pq_last_resort_prekey_public),
    coalesce(v_pq.signature, v_bundle.pq_last_resort_prekey_signature),
    (v_pq.device_id is null),
    v_bundle.bundle_version;
exception
  when unique_violation then
    raise exception 'PREKEY_BUNDLE_ALREADY_CLAIMED';
end;
$$;

revoke all on table public.device_key_bundles, public.device_one_time_prekeys, public.device_pq_one_time_prekeys, public.device_prekey_claims from public;
grant select, insert, update, delete on public.device_key_bundles to authenticated;
grant select, insert, delete on public.device_one_time_prekeys, public.device_pq_one_time_prekeys to authenticated;
grant select on public.device_prekey_claims to authenticated;
revoke all on function public.claim_signal_prekey_bundle(uuid) from public;
grant execute on function public.claim_signal_prekey_bundle(uuid) to authenticated;

comment on function public.claim_signal_prekey_bundle(uuid) is 'Atomic K-ssenger PQXDH public prekey claim. One claim per contact/device/bundle version; consumes EC and PQ one-time prekeys when available.';
