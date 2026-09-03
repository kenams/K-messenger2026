-- Fix: "membership member read" on public.conversation_members (0001_core.sql)
-- referenced conversation_members from within its own USING clause:
--   using (exists(select 1 from public.conversation_members me
--                 where me.conversation_id = conversation_id and me.user_id = auth.uid()))
-- Postgres evaluates RLS on the inner subquery's conversation_members read too,
-- which re-triggers the same policy -> infinite recursion (42P17) on ANY
-- authenticated read that touches this table, including indirectly (e.g. any
-- function checking conversation membership). Found by running the migration
-- set against a real local Postgres for the first time (scripts/rls-integration-test.mjs).
--
-- Fix: use the SECURITY DEFINER helper (bypasses RLS internally, so no
-- self-trigger) introduced in 0008_msn_identity_groups.sql.

drop policy if exists "membership member read" on public.conversation_members;
create policy "membership member read" on public.conversation_members
for select to authenticated
using (public.is_conversation_member(conversation_id));
