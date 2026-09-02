-- Harden K-Feed moderation and age-assurance boundaries.
-- End users may declare age and create pending videos, but only trusted server-side
-- moderation flows (service role, which bypasses RLS) may mark content approved/limited
-- or age assurance verified.

-- Users can only create videos in the pending moderation state.
drop policy if exists "video owner insert" on public.public_videos;
create policy "video owner insert pending only" on public.public_videos
for insert to authenticated
with check (
  owner_id = auth.uid()
  and moderation_status = 'pending'
  and published_at is null
  and visibility in ('public', 'hidden')
);

-- Prevent owners from changing moderation-controlled columns directly.
-- Keep owner update policy for row ownership, then narrow SQL column privileges.
revoke update on table public.public_videos from authenticated;
grant update (caption, thumbnail_path) on table public.public_videos to authenticated;

-- A user can self-declare a birth date, but can never self-promote to verified.
drop policy if exists "age profile owner access" on public.user_age_profile;
create policy "age profile owner read" on public.user_age_profile
for select to authenticated
using (user_id = auth.uid());

create policy "age profile owner declare" on public.user_age_profile
for insert to authenticated
with check (
  user_id = auth.uid()
  and age_assurance_level = 'declared'
  and birth_date <= current_date
);

create policy "age profile owner update declaration" on public.user_age_profile
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and age_assurance_level = 'declared'
  and birth_date <= current_date
);

-- Moderation/report status is server-controlled. Reporters may create and read their reports,
-- but cannot update status themselves.
revoke update on table public.video_reports from authenticated;

comment on column public.user_age_profile.age_assurance_level is
'Only trusted server-side verification may set verified; clients may only persist declared.';
comment on column public.public_videos.moderation_status is
'Server-controlled moderation state. Client inserts must start pending.';
