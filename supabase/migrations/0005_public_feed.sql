create table if not exists public.public_videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  caption text not null default '' check (char_length(caption) <= 2200),
  age_rating smallint not null default 13 check (age_rating in (13,16,18)),
  violence_level text not null default 'none' check (violence_level in ('none','mild','graphic')),
  visibility text not null default 'public' check (visibility in ('public','hidden','removed')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','limited','rejected')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_videos_feed_idx on public.public_videos (visibility, moderation_status, published_at desc);
create index if not exists public_videos_owner_idx on public.public_videos (owner_id, created_at desc);

create table if not exists public.video_reports (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.public_videos(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('violence','sexual','harassment','hate','dangerous','minor_safety','spam','misinformation','other')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique(video_id, reporter_id, reason)
);

create table if not exists public.user_age_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  age_assurance_level text not null default 'declared' check (age_assurance_level in ('declared','verified')),
  updated_at timestamptz not null default now()
);

alter table public.public_videos enable row level security;
alter table public.video_reports enable row level security;
alter table public.user_age_profile enable row level security;

create policy "public approved videos readable" on public.public_videos
for select to authenticated
using (visibility = 'public' and moderation_status in ('approved','limited') or owner_id = auth.uid());

create policy "video owner insert" on public.public_videos
for insert to authenticated
with check (owner_id = auth.uid());

create policy "video owner update" on public.public_videos
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "video owner delete" on public.public_videos
for delete to authenticated
using (owner_id = auth.uid());

create policy "reports own insert" on public.video_reports
for insert to authenticated
with check (reporter_id = auth.uid());

create policy "reports own read" on public.video_reports
for select to authenticated
using (reporter_id = auth.uid());

create policy "age profile owner access" on public.user_age_profile
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on table public.public_videos is 'Public K-Feed videos. Violent/sensitive content must remain age-gated and may be limited or removed by moderation.';
