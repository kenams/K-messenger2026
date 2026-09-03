-- Fix: contact acceptance was two separate service-role calls from the
-- server (upsert contacts, then update request status) — not atomic, a
-- crash/error between them leaves contact_requests.status='pending' with
-- contacts already created, or vice versa. Wrap in one RPC (single
-- transaction per call).

create or replace function public.accept_contact_request(p_recipient_id uuid, p_request_id uuid)
returns public.contact_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.contact_requests%rowtype;
  v_blocked boolean;
begin
  select * into v_request from public.contact_requests
  where id = p_request_id and recipient_id = p_recipient_id and status = 'pending'
  for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  select exists(
    select 1 from public.blocks b
    where (b.blocker_id = v_request.sender_id and b.blocked_id = v_request.recipient_id)
       or (b.blocker_id = v_request.recipient_id and b.blocked_id = v_request.sender_id)
  ) into v_blocked;
  if v_blocked then
    raise exception 'BLOCKED';
  end if;

  insert into public.contacts (owner_id, contact_id)
  values (v_request.sender_id, v_request.recipient_id), (v_request.recipient_id, v_request.sender_id)
  on conflict (owner_id, contact_id) do nothing;

  update public.contact_requests set status = 'accepted' where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

comment on function public.accept_contact_request(uuid, uuid) is
'Atomic contact acceptance: block re-check + reciprocal contacts insert +
request status update in one transaction. Called by the server with the
already-authenticated recipient id, not by clients directly.';

-- SECURITY DEFINER functions are PUBLIC-callable by default. This one takes
-- p_recipient_id as a caller-supplied parameter instead of deriving it from
-- auth.uid() internally (the Node server already verified the JWT and knows
-- the real userId) — so a direct PostgREST call with nothing but an
-- authenticated/anon key could pass ANY p_recipient_id and accept a contact
-- request on someone else's behalf. Lock execution to service_role only.
revoke execute on function public.accept_contact_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_contact_request(uuid, uuid) to service_role;
