-- K-ssenger V2 "vibe" — real social Moments, reactions, pinned Moment, accent colour.

-- 1. Friends / close-friends Moments are between people who already know each other:
--    approve them on sight. Only PUBLIC Moments still need a moderation pass.
alter table public.moments
  drop constraint if exists moments_moderation_status_check;
alter table public.moments
  add constraint moments_moderation_status_check
  check (moderation_status in ('pending','approved','limited','rejected'));

create or replace function public.moment_auto_moderate()
returns trigger language plpgsql as $$
begin
  if new.visibility in ('friends','close_friends') and new.moderation_status = 'pending' then
    new.moderation_status := 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists moment_auto_moderate_trg on public.moments;
create trigger moment_auto_moderate_trg
  before insert on public.moments
  for each row execute function public.moment_auto_moderate();

-- back-fill the Moments that are still stuck "pending" but are friends-only
update public.moments
   set moderation_status = 'approved'
 where visibility in ('friends','close_friends')
   and moderation_status = 'pending'
   and expires_at > now();

-- 2. Pinned Moment: one Moment that lives on the profile and never expires.
alter table public.moments
  add column if not exists is_pinned boolean not null default false;

alter table public.profiles
  add column if not exists pinned_moment_id uuid references public.moments(id) on delete set null;

-- a pinned Moment stays visible to the same audience even past its 24h window
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
           and (m.expires_at>now() or m.is_pinned)
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

-- 3. Reactions become visible to everyone who can see the Moment (for counts + who reacted).
drop policy if exists moment_reactions_self_read on public.moment_reactions;
drop policy if exists moment_reactions_visible_read on public.moment_reactions;
create policy moment_reactions_visible_read on public.moment_reactions for select to authenticated
  using (public.can_view_moment(moment_id, auth.user_id()::uuid));

-- 4. Accent colour — a single hex the owner picks; shown wherever their identity appears.
alter table public.profiles
  add column if not exists accent_color text
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');
