-- K-ssenger V1 push subscriptions.
-- Push tokens are private per-user credentials: authenticated clients may only
-- manage their own rows. The trusted realtime/server database role can read
-- subscriptions for delivery without exposing the registry through RLS.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  expo_push_token text not null,
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expo_push_token)
);

create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id, enabled)
  where enabled = true;

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

drop policy if exists push_subscriptions_self_select on public.push_subscriptions;
create policy push_subscriptions_self_select
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.user_id()::uuid);

drop policy if exists push_subscriptions_self_insert on public.push_subscriptions;
create policy push_subscriptions_self_insert
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.user_id()::uuid);

drop policy if exists push_subscriptions_self_update on public.push_subscriptions;
create policy push_subscriptions_self_update
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.user_id()::uuid)
  with check (user_id = auth.user_id()::uuid);

drop policy if exists push_subscriptions_self_delete on public.push_subscriptions;
create policy push_subscriptions_self_delete
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.user_id()::uuid);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_subscriptions from anon;
