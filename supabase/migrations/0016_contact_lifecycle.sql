-- K-ssenger contact lifecycle hardening.
-- Direct clients may read their request rows and create their own request,
-- but lifecycle transitions remain server-mediated (service_role) so a
-- participant cannot forge arbitrary state transitions through PostgREST.

drop policy if exists "request participants update" on public.contact_requests;
drop policy if exists "request participants delete" on public.contact_requests;

-- Prevent multiple active reverse-direction requests. Historical declined /
-- cancelled rows may remain for audit/debugging without blocking a new request.
create unique index if not exists contact_requests_one_pending_pair_idx
on public.contact_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
where status = 'pending';

create index if not exists contact_requests_recipient_status_idx
on public.contact_requests(recipient_id, status, created_at desc);

create index if not exists contact_requests_sender_status_idx
on public.contact_requests(sender_id, status, created_at desc);

comment on table public.contact_requests is
'Contact requests are readable by participants. State transitions are performed by the K-ssenger server using service_role; direct authenticated UPDATE/DELETE is intentionally unavailable.';
