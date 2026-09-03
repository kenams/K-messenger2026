-- Atomic group creation for K-ssenger.
-- Clients never call this function directly: the authenticated Socket.IO server
-- validates the requester and members first, then invokes it with service_role.

create or replace function public.create_group_conversation(
  p_owner_id uuid,
  p_title text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_member_id uuid;
begin
  if p_owner_id is null then
    raise exception 'OWNER_REQUIRED';
  end if;

  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 80 then
    raise exception 'INVALID_GROUP_TITLE';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) < 1 then
    raise exception 'GROUP_MEMBER_REQUIRED';
  end if;

  -- Initial beta limit: owner + up to 49 invited members.
  if array_length(p_member_ids, 1) > 49 then
    raise exception 'GROUP_TOO_LARGE';
  end if;

  if p_owner_id = any(p_member_ids) then
    raise exception 'OWNER_DUPLICATED_IN_MEMBERS';
  end if;

  if (select count(distinct x) from unnest(p_member_ids) as x) <> array_length(p_member_ids, 1) then
    raise exception 'DUPLICATE_GROUP_MEMBER';
  end if;

  if exists (
    select 1
    from unnest(p_member_ids) member_id
    left join auth.users u on u.id = member_id
    where u.id is null
  ) then
    raise exception 'UNKNOWN_GROUP_MEMBER';
  end if;

  insert into public.conversations (kind, created_by, title)
  values ('group', p_owner_id, btrim(p_title))
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, p_owner_id, 'owner');

  foreach v_member_id in array p_member_ids loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conversation_id, v_member_id, 'member');
  end loop;

  insert into public.group_settings (conversation_id)
  values (v_conversation_id);

  return v_conversation_id;
end;
$$;

revoke all on function public.create_group_conversation(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.create_group_conversation(uuid, text, uuid[]) to service_role;
