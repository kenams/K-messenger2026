-- Fix: "profile readable authenticated" used `using (true)` — any
-- authenticated Supabase client (anon-key-holding mobile/web app calling
-- PostgREST directly, bypassing the Node server) could read ANY user's
-- full profile row, including live `presence`, for total strangers.
-- The Node server (service_role, unaffected by RLS/column grants below)
-- already mediates reads correctly; this closes the direct-client path.

drop policy if exists "profile readable authenticated" on public.profiles;
create policy "profile readable self or contact" on public.profiles
for select to authenticated
using (
  auth.uid() = id
  or exists (select 1 from public.contacts c where c.owner_id = auth.uid() and c.contact_id = profiles.id)
);

-- Even for contacts, the raw `presence` column must not be read directly:
-- "invisible" has to resolve to "offline" for everyone except the owner,
-- and RLS can filter rows but can't transform a column value per-viewer.
revoke select on public.profiles from authenticated;
grant select (id, username, display_name, avatar_url, custom_status, created_at) on public.profiles to authenticated;

create or replace function public.presence_for(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id = auth.uid() then p.presence
    when p.presence = 'invisible' then 'offline'
    else p.presence
  end
  from public.profiles p
  where p.id = p_user_id
  and (
    p.id = auth.uid()
    or exists (select 1 from public.contacts c where c.owner_id = auth.uid() and c.contact_id = p.id)
  );
$$;

comment on function public.presence_for(uuid) is
'Only sanctioned way for a direct (non-server) authenticated client to read
a profile''s presence: masks invisible->offline for everyone but the owner,
and returns nothing for non-contacts. Direct SELECT of profiles.presence is
revoked for the authenticated role (server/service_role is unaffected).';

-- Minimal public discovery for "search username to add contact" (Lot B),
-- deliberately excludes presence/custom_status.
create or replace function public.search_profiles_by_username(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select id, username, display_name, avatar_url
  from public.profiles
  where username ilike p_query || '%'
  and id <> auth.uid()
  limit 20;
$$;
