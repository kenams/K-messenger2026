create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('photo','video','text')),
  caption text check (char_length(caption) <= 280),
  media_url text,
  visibility text not null default 'friends' check (visibility in ('friends','close_friends','public')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','limited','rejected')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create table if not exists public.moment_views (
  moment_id uuid not null references public.moments(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key(moment_id, viewer_id)
);

create table if not exists public.moment_reactions (
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key(moment_id, user_id)
);

create table if not exists public.moment_reports (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','sexual','violence','hate','impersonation','minor_safety','other')),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  unique(moment_id, reporter_id)
);

create index if not exists moments_author_idx on public.moments(author_id, created_at desc);
create index if not exists moments_public_idx on public.moments(visibility, moderation_status, expires_at desc);

alter table public.moments enable row level security;
alter table public.moment_views enable row level security;
alter table public.moment_reactions enable row level security;
alter table public.moment_reports enable row level security;

create policy "moment author manages own" on public.moments
for all using (auth.uid() = author_id)
with check (auth.uid() = author_id and moderation_status = 'pending');

create policy "approved public moments readable" on public.moments
for select to authenticated
using (visibility = 'public' and moderation_status in ('approved','limited') and expires_at > now());

create policy "friend moments readable" on public.moments
for select to authenticated
using (
  visibility = 'friends'
  and moderation_status in ('approved','limited')
  and expires_at > now()
  and exists(
    select 1 from public.contacts c
    where c.owner_id = auth.uid() and c.contact_id = moments.author_id
  )
);

create policy "moment view self insert" on public.moment_views
for insert with check (auth.uid() = viewer_id);
create policy "moment author reads views" on public.moment_views
for select using (
  exists(select 1 from public.moments m where m.id = moment_id and m.author_id = auth.uid())
  or auth.uid() = viewer_id
);

create policy "moment reactions self manage" on public.moment_reactions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "moment reactions readable" on public.moment_reactions
for select to authenticated using (true);

create policy "moment report self insert" on public.moment_reports
for insert with check (auth.uid() = reporter_id);
create policy "moment report self read" on public.moment_reports
for select using (auth.uid() = reporter_id);
