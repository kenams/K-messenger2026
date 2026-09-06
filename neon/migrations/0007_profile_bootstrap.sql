-- CRITICAL FIX (2026-09-05): the mobile app's onboarding screen
-- (ProfileBootstrapScreen.tsx) calls the RPC `ensure_my_kssenger_profile`
-- immediately after first login -- this is the very first thing every new
-- user does. It existed only in the legacy supabase/migrations/ history
-- (0018_profile_bootstrap.sql) and was never ported to Neon when the
-- backend migrated. On the real remote K-ssenger Neon project this
-- function did not exist at all (verified via a real signup/login/RPC
-- call against the live Data API, which returned PGRST202 "Could not
-- find the function"). No real user could ever complete onboarding.
--
-- The Supabase version's `auth.users` insert trigger is Supabase-specific
-- (Neon has no `auth.users` table) and is intentionally not ported here --
-- the mobile app only ever calls the RPC path, so the trigger was
-- redundant for this runtime.

create or replace function public.normalize_kssenger_username(raw_value text, user_id uuid)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := lower(coalesce(raw_value, ''));
  normalized := regexp_replace(normalized, '[^a-z0-9_]', '', 'g');
  normalized := left(normalized, 24);

  if char_length(normalized) < 3 then
    normalized := 'user_' || left(replace(user_id::text, '-', ''), 8);
  end if;

  return normalized;
end;
$$;

create or replace function public.ensure_my_kssenger_profile(p_username text, p_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  final_username text;
  result public.profiles;
begin
  if uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into result from public.profiles where id = uid;
  if found then
    return result;
  end if;

  final_username := public.normalize_kssenger_username(p_username, uid);
  if exists(select 1 from public.profiles where username = final_username) then
    raise exception 'USERNAME_TAKEN';
  end if;

  insert into public.profiles(id, username, display_name, nickname, presence)
  values(uid, final_username, left(coalesce(nullif(trim(p_display_name), ''), final_username), 64), left(coalesce(nullif(trim(p_display_name), ''), final_username), 64), 'offline')
  returning * into result;

  insert into public.privacy_settings(user_id)
  values(uid)
  on conflict (user_id) do nothing;

  return result;
end;
$$;

revoke all on function public.ensure_my_kssenger_profile(text, text) from public;
grant execute on function public.ensure_my_kssenger_profile(text, text) to authenticated;
