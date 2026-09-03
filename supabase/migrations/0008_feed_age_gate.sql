-- Fix: K-Feed video reads were not age-gated server-side. Any authenticated
-- user could SELECT any approved/limited video regardless of its age_rating
-- vs their own declared/verified age — client-side "if (userAge >= rating)"
-- filtering is not a security boundary. Enforce it in RLS instead.

create or replace function public.viewer_max_age_rating()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.user_age_profile where user_id = auth.uid()) then 13
    when date_part('year', age(current_date, (select birth_date from public.user_age_profile where user_id = auth.uid()))) >= 18 then 18
    when date_part('year', age(current_date, (select birth_date from public.user_age_profile where user_id = auth.uid()))) >= 16 then 16
    else 13
  end::smallint;
$$;

comment on function public.viewer_max_age_rating() is
'Most permissive age_rating tier (13/16/18) the current authenticated user may view, derived server-side from user_age_profile.birth_date. No age profile = most restrictive (13).';

drop policy if exists "public approved videos readable" on public.public_videos;
create policy "public approved videos readable" on public.public_videos
for select to authenticated
using (
  owner_id = auth.uid()
  or (
    visibility = 'public'
    and moderation_status in ('approved', 'limited')
    and age_rating <= public.viewer_max_age_rating()
  )
);
