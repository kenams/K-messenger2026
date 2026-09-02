create table if not exists public.location_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  precision text not null check(precision in ('precise','approximate')),
  mode text not null check(mode in ('one_time','live','meet','route')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((recipient_user_id is not null) <> (conversation_id is not null))
);

create table if not exists public.location_points (
  share_id uuid primary key references public.location_shares(id) on delete cascade,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_meters double precision,
  captured_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.location_shares enable row level security;
alter table public.location_points enable row level security;

create policy "location owner manage" on public.location_shares for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "location recipient read" on public.location_shares for select using (
  revoked_at is null and expires_at > now() and (
    recipient_user_id = auth.uid()
    or (conversation_id is not null and exists(select 1 from public.conversation_members cm where cm.conversation_id = location_shares.conversation_id and cm.user_id = auth.uid()))
  )
);
create policy "location point owner write" on public.location_points for all using (
  exists(select 1 from public.location_shares s where s.id = share_id and s.owner_id = auth.uid())
) with check (
  exists(select 1 from public.location_shares s where s.id = share_id and s.owner_id = auth.uid() and s.revoked_at is null and s.expires_at > now())
);
create policy "location point authorized read" on public.location_points for select using (
  exists(select 1 from public.location_shares s where s.id = share_id and s.revoked_at is null and s.expires_at > now() and (
    s.owner_id = auth.uid() or s.recipient_user_id = auth.uid() or (s.conversation_id is not null and exists(select 1 from public.conversation_members cm where cm.conversation_id = s.conversation_id and cm.user_id = auth.uid()))
  ))
);
