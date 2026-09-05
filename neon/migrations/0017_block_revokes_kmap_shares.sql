-- K-ssenger V1 security invariant: blocking either participant must immediately
-- revoke every active K-MAP share between the two accounts. Keep this at the
-- database boundary so future server/UI refactors cannot accidentally preserve
-- location access after a block.
--
-- This migration intentionally matches the live location_shares schema
-- (owner_id / recipient_user_id / revoked_at) and is idempotent. It upgrades
-- the trigger helper without deleting historical rows or dropping a working
-- trigger.

create or replace function public.revoke_location_shares_on_block()
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
       (owner_id = new.blocker_id and recipient_user_id = new.blocked_id)
       or
       (owner_id = new.blocked_id and recipient_user_id = new.blocker_id)
     );
  return new;
end;
$$;

revoke all on function public.revoke_location_shares_on_block() from public;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'revoke_location_on_block'
       and tgrelid = 'public.blocks'::regclass
       and not tgisinternal
  ) then
    create trigger revoke_location_on_block
    after insert on public.blocks
    for each row
    execute function public.revoke_location_shares_on_block();
  end if;
end;
$$;
