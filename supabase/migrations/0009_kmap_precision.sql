-- Fix: location_points exposed exact lat/lon to every authorized recipient
-- via direct table SELECT, even when the share's precision is 'approximate'.
-- "Send exact then round on the client" is not a security boundary.
-- Recipients now read through a SECURITY DEFINER RPC that coarsens
-- coordinates server-side when precision = 'approximate'. Owners keep
-- direct table access to their own rows (unchanged).

drop policy if exists "location point authorized read" on public.location_points;
-- Direct table reads are now owner-only (see "location point owner write" for
-- all == owner_id = auth.uid()). Non-owner recipients must use the RPC below.

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
begin
  select * into v_share from public.location_shares s where s.id = p_share_id;
  if not found or v_share.revoked_at is not null or v_share.expires_at <= now() then
    return;
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
    -- ~1.1km grid (2 decimal places), accuracy floored to a round figure so
    -- it can't be used to reverse-triangulate the true precision.
    return query select
      round(v_point.latitude::numeric, 2)::double precision,
      round(v_point.longitude::numeric, 2)::double precision,
      greatest(coalesce(v_point.accuracy_meters, 0), 1000)::double precision,
      v_point.captured_at,
      v_share.precision;
  end if;
end;
$$;

comment on function public.location_point_for_viewer(uuid) is
'Only way for a non-owner recipient to read a location point. Returns exact
coordinates when share.precision = precise, coarsened (~1.1km grid) when
approximate. Direct SELECT on location_points is owner-only.';

-- TODO(follow-up, not in this fix): auto-revoke active location_shares when
-- either party blocks the other, and on Ghost Mode toggle. Needs a trigger
-- on public.blocks insert + a presence/ghost-mode flag; tracked in
-- docs/PROJECT_STATE.md, not implemented here to keep this commit scoped to
-- the precision-leak fix.
