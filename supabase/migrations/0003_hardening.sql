create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at desc);

create index if not exists messages_sender_client_idx
  on public.messages(sender_user_id, client_message_id);

create index if not exists conversation_members_user_idx
  on public.conversation_members(user_id, conversation_id);

create index if not exists blocks_blocked_idx
  on public.blocks(blocked_id, blocker_id);

-- Prevent direct client updates/deletes of immutable ciphertext records.
-- Service-side deletion workflows can use the service role after authorization.
revoke update, delete on public.messages from authenticated;

-- Only the recipient should be able to accept/decline a pending contact request;
-- the sender may only cancel its own pending request through application logic/RPC.
drop policy if exists "request participants update" on public.contact_requests;
create policy "request recipient update" on public.contact_requests
  for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Keep profile creation scoped to the authenticated account.
create policy "profile self insert" on public.profiles
  for insert with check (auth.uid() = id);

-- Conversation creation and membership mutation stay server-mediated for now.
-- No permissive INSERT/UPDATE/DELETE policies are added for these tables.
