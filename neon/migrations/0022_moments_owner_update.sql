-- V2 fix: let a Moment's author update their own row (needed for pin / unpin).
--
-- The V1 `moments_author_update` WITH CHECK forced `moderation_status = 'pending'`,
-- which was fine when every Moment stayed "pending". Since 0021 auto-approves
-- friends / close-friends Moments, that clause rejected every owner update
-- (pinning included). There is no moderator actor in the product that would
-- legitimately need the old lock, so we relax it: the author may update their
-- own Moment as long as the moderation status stays inside the safe set
-- (they still cannot forge a 'rejected' Moment into anything else — nothing
-- sets 'rejected' today, but the guard keeps that door shut).

drop policy if exists moments_author_update on public.moments;
create policy moments_author_update on public.moments for update to authenticated
  using (author_id = (auth.user_id())::uuid)
  with check (
    author_id = (auth.user_id())::uuid
    and moderation_status in ('pending', 'approved', 'limited')
  );
