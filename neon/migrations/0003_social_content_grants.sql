-- Explicit grants for Neon Data API authenticated role.
-- RLS remains the authorization boundary; moderation fields are constrained by policies.

grant select, insert, update on public.user_age_profile to authenticated;
grant select, insert, update, delete on public.public_videos to authenticated;
grant select, insert on public.video_reports to authenticated;

grant select, insert, update, delete on public.moments to authenticated;
grant select, insert on public.moment_views to authenticated;
grant select, insert, update, delete on public.moment_reactions to authenticated;
grant select, insert on public.moment_reports to authenticated;

grant select, insert, update, delete on public.location_shares to authenticated;
grant select, insert, update, delete on public.location_points to authenticated;

revoke all on function public.viewer_age_years(uuid) from public;
revoke all on function public.not_blocked(uuid, uuid) from public;
revoke all on function public.location_point_for_viewer(uuid) from public;
grant execute on function public.viewer_age_years(uuid) to authenticated;
grant execute on function public.not_blocked(uuid, uuid) to authenticated;
grant execute on function public.location_point_for_viewer(uuid) to authenticated;
