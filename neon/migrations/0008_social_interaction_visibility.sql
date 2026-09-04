-- Prevent authenticated users from interacting with social content they cannot read.
-- Security-definer helpers reproduce the read rules without relying on caller-controlled actor IDs.

create or replace function public.can_view_moment(p_moment_id uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.moments m
     where m.id=p_moment_id
       and (
         m.author_id=p_viewer
         or (
           m.author_id<>p_viewer
           and m.moderation_status in ('approved','limited')
           and m.expires_at>now()
           and public.not_blocked(p_viewer,m.author_id)
           and (
             m.visibility='public'
             or (m.visibility='friends' and public.is_contact(p_viewer,m.author_id))
             or (m.visibility='close_friends' and exists(
               select 1 from public.contacts c
                where c.owner_id=m.author_id and c.contact_id=p_viewer and c.favorite
             ))
           )
         )
       )
  );
$$;

create or replace function public.can_view_video(p_video_id uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.public_videos v
     where v.id=p_video_id
       and (
         v.owner_id=p_viewer
         or (
           v.owner_id<>p_viewer
           and v.visibility='public'
           and v.moderation_status in ('approved','limited')
           and v.published_at is not null
           and v.published_at<=now()
           and public.not_blocked(p_viewer,v.owner_id)
           and coalesce(public.viewer_age_years(p_viewer),0)>=v.age_rating
           and (v.violence_level<>'graphic' or coalesce(public.viewer_age_years(p_viewer),0)>=18)
         )
       )
  );
$$;

drop policy if exists moment_reactions_self_all on public.moment_reactions;
create policy moment_reactions_self_read on public.moment_reactions for select to authenticated
using (user_id = auth.user_id()::uuid);
create policy moment_reactions_self_insert on public.moment_reactions for insert to authenticated
with check (user_id = auth.user_id()::uuid and public.can_view_moment(moment_id, auth.user_id()::uuid));
create policy moment_reactions_self_update on public.moment_reactions for update to authenticated
using (user_id = auth.user_id()::uuid)
with check (user_id = auth.user_id()::uuid and public.can_view_moment(moment_id, auth.user_id()::uuid));
create policy moment_reactions_self_delete on public.moment_reactions for delete to authenticated
using (user_id = auth.user_id()::uuid);

drop policy if exists moment_views_self_insert on public.moment_views;
create policy moment_views_self_insert on public.moment_views for insert to authenticated
with check (viewer_id = auth.user_id()::uuid and public.can_view_moment(moment_id, auth.user_id()::uuid));

drop policy if exists moment_reports_self_insert on public.moment_reports;
create policy moment_reports_self_insert on public.moment_reports for insert to authenticated
with check (reporter_id = auth.user_id()::uuid and public.can_view_moment(moment_id, auth.user_id()::uuid));

drop policy if exists video_reports_self_insert on public.video_reports;
create policy video_reports_self_insert on public.video_reports for insert to authenticated
with check (reporter_id = auth.user_id()::uuid and public.can_view_video(video_id, auth.user_id()::uuid));

revoke all on function public.can_view_moment(uuid,uuid) from public;
revoke all on function public.can_view_video(uuid,uuid) from public;
grant execute on function public.can_view_moment(uuid,uuid) to authenticated;
grant execute on function public.can_view_video(uuid,uuid) to authenticated;
