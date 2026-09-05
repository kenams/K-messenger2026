-- K-ssenger media metadata and authorization layer.
-- Files live in the dedicated private Neon Object Storage bucket `kssenger-media`.
-- Clients may only register pending objects under their own user-id prefix.
-- A trusted server/function must promote an object to ready after validating upload metadata.

create table if not exists public.media_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references neon_auth."user"(id) on delete cascade,
  bucket_name text not null default 'kssenger-media' check (bucket_name = 'kssenger-media'),
  object_key text not null unique check (char_length(object_key) between 3 and 1024),
  purpose text not null check (purpose in ('avatar','chat','kfeed','moment')),
  conversation_id uuid references public.conversations(id) on delete cascade,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 104857600),
  sha256_hex text check (sha256_hex is null or sha256_hex ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','ready','quarantined','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((purpose = 'chat' and conversation_id is not null) or (purpose <> 'chat' and conversation_id is null))
);

create index if not exists media_objects_owner_idx on public.media_objects(owner_id, created_at desc);
create index if not exists media_objects_conversation_idx on public.media_objects(conversation_id, created_at desc) where conversation_id is not null;
create index if not exists media_objects_status_idx on public.media_objects(status, created_at desc);

alter table public.media_objects enable row level security;
alter table public.media_objects force row level security;

create policy media_owner_read on public.media_objects
for select to authenticated
using (owner_id = auth.user_id()::uuid);

create policy media_chat_member_read on public.media_objects
for select to authenticated
using (
  purpose = 'chat'
  and status = 'ready'
  and conversation_id is not null
  and public.is_conversation_member(conversation_id, auth.user_id()::uuid)
);

create policy media_owner_register_pending on public.media_objects
for insert to authenticated
with check (
  owner_id = auth.user_id()::uuid
  and bucket_name = 'kssenger-media'
  and object_key like auth.user_id()::text || '/%'
  and status = 'pending'
  and (
    purpose <> 'chat'
    or (
      conversation_id is not null
      and public.is_conversation_member(conversation_id, auth.user_id()::uuid)
    )
  )
);

create policy media_owner_update_pending on public.media_objects
for update to authenticated
using (owner_id = auth.user_id()::uuid and status = 'pending')
with check (
  owner_id = auth.user_id()::uuid
  and bucket_name = 'kssenger-media'
  and object_key like auth.user_id()::text || '/%'
  and status = 'pending'
);

create policy media_owner_delete_pending on public.media_objects
for delete to authenticated
using (owner_id = auth.user_id()::uuid and status = 'pending');

revoke all on table public.media_objects from public;
grant select, insert, update, delete on table public.media_objects to authenticated;

comment on table public.media_objects is 'K-ssenger private Neon Object Storage metadata. RLS prevents cross-user registration and chat metadata leakage; trusted backend promotion is required before playback.';
