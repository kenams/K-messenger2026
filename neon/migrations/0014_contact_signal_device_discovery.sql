-- K-ssenger E2EE device discovery.
-- Contacts may discover only active devices for users they are mutually allowed
-- to communicate with. Private key material is never stored in this table.

create policy devices_contact_active_read on public.devices
for select to authenticated
using (
  revoked_at is null
  and user_id <> auth.user_id()::uuid
  and public.is_contact(auth.user_id()::uuid, user_id)
  and public.not_blocked(auth.user_id()::uuid, user_id)
);

comment on policy devices_contact_active_read on public.devices is
  'Allows authenticated contacts to discover active K-ssenger device UUIDs for per-device Signal sessions; block state is enforced.';
