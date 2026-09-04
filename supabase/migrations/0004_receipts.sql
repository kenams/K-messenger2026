create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key(message_id, user_id)
);

alter table public.message_receipts enable row level security;

create policy "receipt owner read" on public.message_receipts
  for select using (auth.uid() = user_id);

create policy "receipt owner update" on public.message_receipts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists message_receipts_user_idx
  on public.message_receipts(user_id, message_id);
