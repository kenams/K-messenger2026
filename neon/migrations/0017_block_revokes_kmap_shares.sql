-- K-ssenger V1 security invariant: blocking either participant must immediately
-- revoke every active K-MAP share between the two accounts. Keep this at the
-- database boundary so future server/UI refactors cannot accidentally preserve
-- location access after a block.

create or replace function public.revoke_kmap_shares_on_block()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.location_shares
   where (user_id = new.blocker_id and visible_to = new.blocked_id)
      or (user_id = new.blocked_id and visible_to = new.blocker_id);
  return new;
end;
$$;

revoke all on function public.revoke_kmap_shares_on_block() from public;

drop trigger if exists blocks_revoke_kmap_shares on public.blocks;
create trigger blocks_revoke_kmap_shares
after insert on public.blocks
for each row
execute function public.revoke_kmap_shares_on_block();
