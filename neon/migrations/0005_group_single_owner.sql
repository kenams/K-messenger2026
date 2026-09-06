-- K-ssenger group integrity hardening for already-provisioned Neon databases.
-- Enforces at most one owner row per conversation. The server transfers ownership
-- transactionally by demoting the current owner before promoting the successor.

create unique index if not exists conversation_members_single_owner_idx
  on public.conversation_members (conversation_id)
  where role = 'owner';
