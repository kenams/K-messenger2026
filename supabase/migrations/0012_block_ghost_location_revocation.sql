-- Privacy hardening: a block or Ghost Mode toggle must immediately revoke
-- active K-MAP shares. This migration keeps the rule in Postgres so it also
-- applies when writes bypass the Node/Socket.IO server.

alter table public.privacy_settings
  add column if not exists ghost_mode boolean not null default false;

create or replace function public.revoke_location_shares_for_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.location_shares s
  set revoked_at = coalesce(s.revoked_at, now())
  where s.revoked_at is null
    and s.expires_at > now()
    and (
      (s.owner_id = new.blocker_id and s.recipient_user_id = new.blocked_id)
      or (s.owner_id = new.blocked_id and s.recipient_user_id = new.blocker_id)
      or (
        s.conversation_id is not null
        and (s.owner_id = new.blocker_id or s.owner_id = new.blocked_id)
        and exists (
          select 1
          from public.conversation_members cm
          where cm.conversation_id = s.conversation_id
            and cm.user_id = case
              when s.owner_id = new.blocker_id then new.blocked_id
              else new.blocker_id
            end
        )
      )
    );
  return new;
end;
$$;

revoke all on function public.revoke_location_shares_for_block() from public, anon, authenticated;

 drop trigger if exists blocks_revoke_location_shares on public.blocks;
create trigger blocks_revoke_location_shares
after insert on public.blocks
for each row execute function public.revoke_location_shares_for_block();

create or replace function public.revoke_location_shares_on_ghost_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ghost_mode = true and old.ghost_mode is distinct from true then
    update public.location_shares
    set revoked_at = coalesce(revoked_at, now())
    where owner_id = new.user_id
      and revoked_at is null
      and expires_at > now();
  end if;
  return new;
end;
$$;

revoke all on function public.revoke_location_shares_on_ghost_mode() from public, anon, authenticated;

drop trigger if exists privacy_ghost_revoke_location_shares on public.privacy_settings;
create trigger privacy_ghost_revoke_location_shares
after update of ghost_mode on public.privacy_settings
for each row execute function public.revoke_location_shares_on_ghost_mode();

-- Belt-and-suspenders read guard: even before/while a revocation update is
-- observed by a client, non-owners receive no location if the owner is in
-- Ghost Mode. Owners may still inspect their own last point locally.
create or replace function public.location_point_for_viewer(p_share_id uuid)
returns table (
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  captured_at timestamptz,
  precision_level text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_share public.location_shares%rowtype;
  v_point public.location_points%rowtype;
  v_authorized boolean;
  v_ghost boolean;
begin
  select * into v_share from public.location_shares s where s.id = p_share_id;
  if not found or v_share.revoked_at is not null or v_share.expires_at <= now() then
    return;
  end if;

  if v_share.owner_id <> auth.uid() then
    select coalesce(ps.ghost_mode, false) into v_ghost
    from public.privacy_settings ps
    where ps.user_id = v_share.owner_id;
    if coalesce(v_ghost, false) then
      return;
    end if;
  end if;

  v_authorized := v_share.owner_id = auth.uid()
    or v_share.recipient_user_id = auth.uid()
    or (
      v_share.conversation_id is not null
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = v_share.conversation_id and cm.user_id = auth.uid()
      )
    );
  if not v_authorized then
    return;
  end if;

  select * into v_point from public.location_points p where p.share_id = p_share_id;
  if not found then
    return;
  end if;

  if v_share.owner_id = auth.uid() or v_share.precision = 'precise' then
    return query select v_point.latitude, v_point.longitude, v_point.accuracy_meters, v_point.captured_at, v_share.precision;
  else
    return query select
      round(v_point.latitude::numeric, 2)::double precision,
      round(v_point.longitude::numeric, 2)::double precision,
      greatest(coalesce(v_point.accuracy_meters, 0), 1000)::double precision,
      v_point.captured_at,
      v_share.precision;
  end if;
end;
$$;
