-- Defense-in-depth for databases that may have evaluated an earlier 0006 draft.
-- The group ban registry is server-only: mobile/web clients must use the
-- authenticated owner/admin realtime endpoint instead of reading rows directly.

drop policy if exists group_bans_member_read on public.group_bans;
revoke select, insert, update, delete on public.group_bans from authenticated;
