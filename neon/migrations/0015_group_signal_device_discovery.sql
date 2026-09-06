-- K-ssenger group E2EE device discovery.
-- Device UUID discovery is limited to users who currently share a group and
-- are not blocked. No private key material is stored server-side.

create or replace function public.shares_group(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
      from public.conversation_members viewer_member
      join public.conversation_members target_member
        on target_member.conversation_id = viewer_member.conversation_id
      join public.conversations c
        on c.id = viewer_member.conversation_id
     where viewer_member.user_id = p_viewer
       and target_member.user_id = p_target
       and c.kind = 'group'
       and p_viewer <> p_target
  );
$$;

create policy devices_shared_group_active_read on public.devices
for select to authenticated
using (
  revoked_at is null
  and user_id <> auth.user_id()::uuid
  and public.shares_group(auth.user_id()::uuid, user_id)
  and public.not_blocked(auth.user_id()::uuid, user_id)
);

revoke all on function public.shares_group(uuid, uuid) from public;
grant execute on function public.shares_group(uuid, uuid) to authenticated;

comment on function public.shares_group(uuid, uuid) is
  'Security-definer membership predicate used only for K-ssenger group E2EE device discovery.';
