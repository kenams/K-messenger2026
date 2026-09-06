-- Split K-MAP owner policy so an owner may explicitly revoke an active share.
-- New shares must still start active and authorized; updates cannot change ownership.

drop policy if exists location_owner_manage on public.location_shares;

create policy location_owner_read on public.location_shares for select to authenticated
using (owner_id = auth.user_id()::uuid);

create policy location_owner_insert on public.location_shares for insert to authenticated
with check (
  owner_id = auth.user_id()::uuid
  and revoked_at is null
  and expires_at > now()
  and (
    (recipient_user_id is not null
      and public.is_contact(owner_id, recipient_user_id)
      and public.not_blocked(owner_id, recipient_user_id))
    or
    (conversation_id is not null
      and public.is_conversation_member(conversation_id, owner_id))
  )
);

create policy location_owner_update on public.location_shares for update to authenticated
using (owner_id = auth.user_id()::uuid)
with check (
  owner_id = auth.user_id()::uuid
  and expires_at > created_at
  and (
    (recipient_user_id is not null
      and public.is_contact(owner_id, recipient_user_id)
      and public.not_blocked(owner_id, recipient_user_id))
    or
    (conversation_id is not null
      and public.is_conversation_member(conversation_id, owner_id))
  )
);

create policy location_owner_delete on public.location_shares for delete to authenticated
using (owner_id = auth.user_id()::uuid);
