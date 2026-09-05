-- K-ssenger V1 privacy invariant: removing a contact must immediately revoke
-- every active K-MAP share between the two accounts. Location access must not
-- survive the contact relationship that authorized it.
--
-- Keep this at the database boundary so server/UI refactors cannot leave a
-- stale live share behind. The trigger is intentionally idempotent and only
-- stamps active shares; historical rows remain available for account export
-- and audit without exposing live coordinates.

create or replace function public.revoke_location_shares_on_contact_removal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.location_shares
     set revoked_at = coalesce(revoked_at, now())
   where revoked_at is null
     and (
       (owner_id = old.owner_id and recipient_user_id = old.contact_id)
       or
       (owner_id = old.contact_id and recipient_user_id = old.owner_id)
     );
  return old;
end;
$$;

revoke all on function public.revoke_location_shares_on_contact_removal() from public;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'revoke_location_on_contact_removal'
       and tgrelid = 'public.contacts'::regclass
       and not tgisinternal
  ) then
    create trigger revoke_location_on_contact_removal
    after delete on public.contacts
    for each row
    execute function public.revoke_location_shares_on_contact_removal();
  end if;
end;
$$;
