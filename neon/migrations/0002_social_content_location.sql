-- K-ssenger Neon V1 social-content + location schema.
-- Dedicated to Neon Auth (`auth.user_id()`); no Supabase runtime dependency.

create table if not exists public.user_age_profile (
  user_id uuid primary key references neon_auth."user"(id) on delete cascade,
  birth_date date not null check (birth_date <= current_date - interval '13 years'),
  age_assurance_level text not null default 'declared' check (age_assurance_level in ('declared','verified')),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references neon_auth."user"(id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 1 and 1024),
  thumbnail_path text check (thumbnail_path is null or char_length(thumbnail_path) <= 1024),
  caption text not null default '' check (char_length(caption) <= 2200),
  age_rating smallint not null default 13 check (age_rating in (13,16,18)),
  violence_level text not null default 'none' check (violence_level in ('none','mild','graphic')),
  visibility text not null default 'public' check (visibility in ('public','hidden','removed')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','limited','rejected')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.public_videos(id) on delete cascade,
  reporter_id uuid not null references neon_auth."user"(id) on delete cascade,
  reason text not null check (reason in ('violence','sexual','harassment','hate','dangerous','minor_safety','spam','misinformation','other')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique(video_id, reporter_id, reason)
);

create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references neon_auth."user"(id) on delete cascade,
  kind text not null check (kind in ('photo','video','text')),
  caption text check (caption is null or char_length(caption) <= 280),
  media_url text check (media_url is null or char_length(media_url) <= 1024),
  visibility text not null default 'friends' check (visibility in ('friends','close_friends','public')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','limited','rejected')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists public.moment_views (
  moment_id uuid not null references public.moments(id) on delete cascade,
  viewer_id uuid not null references neon_auth."user"(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key(moment_id, viewer_id)
);

create table if not exists public.moment_reactions (
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key(moment_id, user_id)
);

create table if not exists public.moment_reports (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  reporter_id uuid not null references neon_auth."user"(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','sexual','violence','hate','impersonation','minor_safety','other')),
  details text check (details is null or char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  unique(moment_id, reporter_id)
);

create table if not exists public.location_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references neon_auth."user"(id) on delete cascade,
  recipient_user_id uuid references neon_auth."user"(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  precision text not null check(precision in ('precise','approximate')),
  mode text not null check(mode in ('one_time','live','meet','route')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((recipient_user_id is not null) <> (conversation_id is not null)),
  check (recipient_user_id is null or recipient_user_id <> owner_id),
  check (expires_at > created_at)
);

create table if not exists public.location_points (
  share_id uuid primary key references public.location_shares(id) on delete cascade,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  captured_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists public_videos_feed_idx on public.public_videos (visibility, moderation_status, published_at desc);
create index if not exists public_videos_owner_idx on public.public_videos (owner_id, created_at desc);
create index if not exists moments_author_idx on public.moments(author_id, created_at desc);
create index if not exists moments_public_idx on public.moments(visibility, moderation_status, expires_at desc);
create index if not exists location_shares_owner_idx on public.location_shares(owner_id, expires_at desc);
create index if not exists location_shares_recipient_idx on public.location_shares(recipient_user_id, expires_at desc) where recipient_user_id is not null;

alter table public.user_age_profile enable row level security;
alter table public.public_videos enable row level security;
alter table public.video_reports enable row level security;
alter table public.moments enable row level security;
alter table public.moment_views enable row level security;
alter table public.moment_reactions enable row level security;
alter table public.moment_reports enable row level security;
alter table public.location_shares enable row level security;
alter table public.location_points enable row level security;

create or replace function public.viewer_age_years(p_user_id uuid)
returns integer language sql stable security definer set search_path=public as $$
  select extract(year from age(current_date, u.birth_date))::integer
    from public.user_age_profile u
   where u.user_id = p_user_id;
$$;

create or replace function public.not_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select not exists(
    select 1 from public.blocks x
     where (x.blocker_id=a and x.blocked_id=b)
        or (x.blocker_id=b and x.blocked_id=a)
  );
$$;

create policy age_profile_self_all on public.user_age_profile for all to authenticated
using (user_id = auth.user_id()::uuid) with check (user_id = auth.user_id()::uuid);

create policy videos_owner_read on public.public_videos for select to authenticated
using (owner_id = auth.user_id()::uuid);
create policy videos_age_gated_public_read on public.public_videos for select to authenticated
using (
  owner_id <> auth.user_id()::uuid
  and visibility = 'public'
  and moderation_status in ('approved','limited')
  and published_at is not null
  and published_at <= now()
  and public.not_blocked(auth.user_id()::uuid, owner_id)
  and coalesce(public.viewer_age_years(auth.user_id()::uuid), 0) >= age_rating
  and (violence_level <> 'graphic' or coalesce(public.viewer_age_years(auth.user_id()::uuid), 0) >= 18)
);
create policy videos_owner_insert on public.public_videos for insert to authenticated
with check (owner_id = auth.user_id()::uuid and moderation_status = 'pending' and published_at is null);
create policy videos_owner_update on public.public_videos for update to authenticated
using (owner_id = auth.user_id()::uuid)
with check (owner_id = auth.user_id()::uuid and moderation_status = 'pending');
create policy videos_owner_delete on public.public_videos for delete to authenticated
using (owner_id = auth.user_id()::uuid);

create policy video_reports_self_insert on public.video_reports for insert to authenticated
with check (reporter_id = auth.user_id()::uuid);
create policy video_reports_self_read on public.video_reports for select to authenticated
using (reporter_id = auth.user_id()::uuid);

create policy moments_author_read on public.moments for select to authenticated
using (author_id = auth.user_id()::uuid);
create policy moments_public_read on public.moments for select to authenticated
using (
  author_id <> auth.user_id()::uuid
  and visibility = 'public'
  and moderation_status in ('approved','limited')
  and expires_at > now()
  and public.not_blocked(auth.user_id()::uuid, author_id)
);
create policy moments_friends_read on public.moments for select to authenticated
using (
  author_id <> auth.user_id()::uuid
  and visibility = 'friends'
  and moderation_status in ('approved','limited')
  and expires_at > now()
  and public.is_contact(auth.user_id()::uuid, author_id)
  and public.not_blocked(auth.user_id()::uuid, author_id)
);
create policy moments_close_friends_read on public.moments for select to authenticated
using (
  author_id <> auth.user_id()::uuid
  and visibility = 'close_friends'
  and moderation_status in ('approved','limited')
  and expires_at > now()
  and exists(select 1 from public.contacts c where c.owner_id=author_id and c.contact_id=auth.user_id()::uuid and c.favorite)
  and public.not_blocked(auth.user_id()::uuid, author_id)
);
create policy moments_author_insert on public.moments for insert to authenticated
with check (author_id = auth.user_id()::uuid and moderation_status = 'pending');
create policy moments_author_update on public.moments for update to authenticated
using (author_id = auth.user_id()::uuid)
with check (author_id = auth.user_id()::uuid and moderation_status = 'pending');
create policy moments_author_delete on public.moments for delete to authenticated
using (author_id = auth.user_id()::uuid);

create policy moment_views_self_insert on public.moment_views for insert to authenticated
with check (viewer_id = auth.user_id()::uuid);
create policy moment_views_author_or_self_read on public.moment_views for select to authenticated
using (
  viewer_id = auth.user_id()::uuid
  or exists(select 1 from public.moments m where m.id=moment_id and m.author_id=auth.user_id()::uuid)
);
create policy moment_reactions_self_all on public.moment_reactions for all to authenticated
using (user_id = auth.user_id()::uuid) with check (user_id = auth.user_id()::uuid);
create policy moment_reactions_author_read on public.moment_reactions for select to authenticated
using (exists(select 1 from public.moments m where m.id=moment_id and m.author_id=auth.user_id()::uuid));
create policy moment_reports_self_insert on public.moment_reports for insert to authenticated
with check (reporter_id = auth.user_id()::uuid);
create policy moment_reports_self_read on public.moment_reports for select to authenticated
using (reporter_id = auth.user_id()::uuid);

create policy location_owner_manage on public.location_shares for all to authenticated
using (owner_id = auth.user_id()::uuid)
with check (
  owner_id = auth.user_id()::uuid
  and revoked_at is null
  and expires_at > now()
  and (
    (recipient_user_id is not null
      and public.is_contact(owner_id, recipient_user_id)
      and public.not_blocked(owner_id, recipient_user_id))
    or
    (conversation_id is not null
      and public.is_conversation_member(conversation_id, owner_id))
  )
);
create policy location_recipient_read on public.location_shares for select to authenticated
using (
  revoked_at is null and expires_at > now()
  and owner_id <> auth.user_id()::uuid
  and public.not_blocked(auth.user_id()::uuid, owner_id)
  and (
    recipient_user_id = auth.user_id()::uuid
    or (conversation_id is not null and public.is_conversation_member(conversation_id, auth.user_id()::uuid))
  )
);

-- Exact location rows are never directly readable by recipients. Owners write/read
-- the raw point; recipients must use location_point_for_viewer(), which coarsens
-- approximate shares on the server before returning coordinates.
create policy location_point_owner_all on public.location_points for all to authenticated
using (exists(select 1 from public.location_shares s where s.id=share_id and s.owner_id=auth.user_id()::uuid))
with check (exists(select 1 from public.location_shares s where s.id=share_id and s.owner_id=auth.user_id()::uuid and s.revoked_at is null and s.expires_at > now()));

create or replace function public.location_point_for_viewer(p_share_id uuid)
returns table (
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  captured_at timestamptz,
  precision_level text
)
language plpgsql stable security definer set search_path=public as $$
declare
  v_share public.location_shares%rowtype;
  v_point public.location_points%rowtype;
  v_viewer uuid := auth.user_id()::uuid;
begin
  select * into v_share from public.location_shares s where s.id=p_share_id;
  if not found or v_share.revoked_at is not null or v_share.expires_at <= now() then return; end if;
  if not public.not_blocked(v_viewer, v_share.owner_id) then return; end if;
  if not (
    v_share.owner_id=v_viewer
    or v_share.recipient_user_id=v_viewer
    or (v_share.conversation_id is not null and public.is_conversation_member(v_share.conversation_id, v_viewer))
  ) then return; end if;

  select * into v_point from public.location_points p where p.share_id=p_share_id;
  if not found then return; end if;

  if v_share.owner_id=v_viewer or v_share.precision='precise' then
    return query select v_point.latitude, v_point.longitude, v_point.accuracy_meters, v_point.captured_at, v_share.precision;
  end if;

  return query select
    round(v_point.latitude::numeric, 2)::double precision,
    round(v_point.longitude::numeric, 2)::double precision,
    greatest(coalesce(v_point.accuracy_meters, 0), 1000)::double precision,
    v_point.captured_at,
    v_share.precision;
end;
$$;

create or replace function public.revoke_location_shares_on_block()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.location_shares
     set revoked_at = coalesce(revoked_at, now())
   where revoked_at is null
     and (
       (owner_id=new.blocker_id and recipient_user_id=new.blocked_id)
       or (owner_id=new.blocked_id and recipient_user_id=new.blocker_id)
     );
  return new;
end;
$$;

drop trigger if exists revoke_location_on_block on public.blocks;
create trigger revoke_location_on_block
after insert on public.blocks
for each row execute function public.revoke_location_shares_on_block();

revoke all on function public.location_point_for_viewer(uuid) from public;
grant execute on function public.location_point_for_viewer(uuid) to authenticated;

comment on function public.location_point_for_viewer(uuid) is 'Recipient-safe K-MAP read: exact only for precise shares; approximate shares are coarsened server-side.';
comment on table public.public_videos is 'K-Feed metadata with server-enforced age gating and moderation state.';
comment on table public.moments is 'Ephemeral K-ssenger moments; expired or blocked content is not readable by non-authors.';
