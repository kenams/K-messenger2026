-- Bind V1 content rows to verified private K-ssenger media metadata.
-- Legacy URL/path columns remain readable during migration but cannot be used to
-- create new K-Feed/video Moments without a ready owner-matched media object.

alter table public.profiles
  add column if not exists avatar_media_id uuid references public.media_objects(id) on delete set null;

alter table public.public_videos
  add column if not exists media_object_id uuid references public.media_objects(id) on delete restrict,
  add column if not exists thumbnail_media_id uuid references public.media_objects(id) on delete set null;

alter table public.moments
  add column if not exists media_object_id uuid references public.media_objects(id) on delete restrict;

create index if not exists profiles_avatar_media_idx on public.profiles(avatar_media_id) where avatar_media_id is not null;
create index if not exists public_videos_media_idx on public.public_videos(media_object_id) where media_object_id is not null;
create index if not exists moments_media_idx on public.moments(media_object_id) where media_object_id is not null;

create or replace function public.require_ready_owned_media(
  p_media_id uuid,
  p_owner_id uuid,
  p_purpose text
)
returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.media_objects m
    where m.id=p_media_id
      and m.owner_id=p_owner_id
      and m.purpose=p_purpose
      and m.status='ready'
      and m.conversation_id is null
  );
$$;

create or replace function public.enforce_profile_avatar_media()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.avatar_media_id is not null
     and not public.require_ready_owned_media(new.avatar_media_id,new.id,'avatar') then
    raise exception 'INVALID_AVATAR_MEDIA';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_public_video_media()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.media_object_id is null
     or not public.require_ready_owned_media(new.media_object_id,new.owner_id,'kfeed') then
    raise exception 'INVALID_KFEED_MEDIA';
  end if;
  if new.thumbnail_media_id is not null
     and not public.require_ready_owned_media(new.thumbnail_media_id,new.owner_id,'kfeed') then
    raise exception 'INVALID_KFEED_THUMBNAIL';
  end if;
  -- Prevent new clients from smuggling a second arbitrary remote location.
  new.storage_path := 'media:' || new.media_object_id::text;
  new.thumbnail_path := case when new.thumbnail_media_id is null then null else 'media:' || new.thumbnail_media_id::text end;
  return new;
end;
$$;

create or replace function public.enforce_moment_media()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.kind='text' then
    if new.media_object_id is not null then raise exception 'TEXT_MOMENT_MEDIA_FORBIDDEN'; end if;
    new.media_url := null;
  else
    if new.media_object_id is null
       or not public.require_ready_owned_media(new.media_object_id,new.author_id,'moment') then
      raise exception 'INVALID_MOMENT_MEDIA';
    end if;
    new.media_url := 'media:' || new.media_object_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_avatar_media_guard on public.profiles;
create trigger profiles_avatar_media_guard
before insert or update of avatar_media_id on public.profiles
for each row execute function public.enforce_profile_avatar_media();

drop trigger if exists public_videos_media_guard on public.public_videos;
create trigger public_videos_media_guard
before insert or update of media_object_id, thumbnail_media_id, owner_id on public.public_videos
for each row execute function public.enforce_public_video_media();

drop trigger if exists moments_media_guard on public.moments;
create trigger moments_media_guard
before insert or update of kind, media_object_id, author_id on public.moments
for each row execute function public.enforce_moment_media();

revoke all on function public.require_ready_owned_media(uuid,uuid,text) from public;
