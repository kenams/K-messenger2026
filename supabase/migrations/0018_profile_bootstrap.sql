-- Create a safe K-ssenger profile automatically for every new auth account.
-- The mobile signup sends username/display_name through auth user metadata.
-- This trigger runs with definer rights so clients never need INSERT access on profiles.

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

create or replace function public.handle_kssenger_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  final_username text;
  requested_display_name text;
begin
  requested_username := public.normalize_kssenger_username(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1)),
    new.id
  );

  final_username := requested_username;
  if exists(select 1 from public.profiles where username = final_username) then
    final_username := left(requested_username, 24) || '_' || left(replace(new.id::text, '-', ''), 6);
  end if;

  requested_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested_display_name is null then
    requested_display_name := final_username;
  end if;

  insert into public.profiles(id, username, display_name, nickname, presence)
  values(new.id, final_username, left(requested_display_name, 64), left(requested_display_name, 64), 'offline')
  on conflict (id) do nothing;

  insert into public.privacy_settings(user_id)
  values(new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_kssenger on auth.users;
create trigger on_auth_user_created_kssenger
after insert on auth.users
for each row execute function public.handle_kssenger_new_user();

-- Existing authenticated users created before this migration can bootstrap their own profile.
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

revoke all on function public.ensure_my_kssenger_profile(text, text) from public, anon;
grant execute on function public.ensure_my_kssenger_profile(text, text) to authenticated;
