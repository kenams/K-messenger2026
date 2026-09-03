-- Contact-request rows contain authorization-sensitive identities.
-- The original UPDATE policy let either participant update arbitrary columns,
-- including sender_id/recipient_id, through PostgREST. Client-side mutation is
-- therefore disabled; transitions are performed by controlled server/service
-- RPCs instead.

drop policy if exists "request participants update" on public.contact_requests;

revoke update on public.contact_requests from authenticated;
revoke update on public.contact_requests from anon;

-- Existing accept_contact_request() is service_role-only (0010). Keep future
-- decline/cancel transitions behind the same trusted boundary rather than
-- re-opening generic row UPDATE to mobile/web clients.
