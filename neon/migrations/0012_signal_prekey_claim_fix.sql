-- Fix PL/pgSQL ambiguity between RETURNS TABLE output names and prekey columns.
-- Security semantics are unchanged; table aliases make the atomic updates explicit.
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
    update public.device_one_time_prekeys as otp
       set claimed_at=now(), claimed_by=v_viewer
     where otp.device_id=v_ec.device_id and otp.key_id=v_ec.key_id;
  end if;

  select p.* into v_pq
    from public.device_pq_one_time_prekeys p
   where p.device_id=p_device_id and p.claimed_at is null
   order by p.key_id
   for update skip locked limit 1;
  if found then
    update public.device_pq_one_time_prekeys as pq
       set claimed_at=now(), claimed_by=v_viewer
     where pq.device_id=v_pq.device_id and pq.key_id=v_pq.key_id;
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

revoke all on function public.claim_signal_prekey_bundle(uuid) from public;
grant execute on function public.claim_signal_prekey_bundle(uuid) to authenticated;
