-- V2 fix: the 0021 auto-moderate trigger flips friends / close-friends Moments to
-- 'approved' in a BEFORE INSERT trigger, but `moments_author_insert` WITH CHECK
-- still demanded `moderation_status = 'pending'`. RLS WITH CHECK runs AFTER the
-- BEFORE trigger, so every friends / close-friends Moment insert was rejected.
--
-- Align the INSERT policy with the trigger: the author may insert a 'pending'
-- Moment (any visibility) or an 'approved' Moment only when it is friends /
-- close-friends scoped (exactly what the trigger produces). A public Moment can
-- never be inserted pre-approved.

drop policy if exists moments_author_insert on public.moments;
create policy moments_author_insert on public.moments for insert to authenticated
  with check (
    author_id = (auth.user_id())::uuid
    and (
      moderation_status = 'pending'
      or (moderation_status = 'approved' and visibility in ('friends', 'close_friends'))
    )
  );
