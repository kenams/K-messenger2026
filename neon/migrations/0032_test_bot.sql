-- K-Bot: a personal test contact for Kenams only (see docs/PROJECT_STATE.md).
--
-- SECURITY NOTE — the one deliberate exception in this codebase's E2EE model:
-- every real user's private key stays on-device only (see apps/mobile/src/lib/e2ee.ts).
-- This single, clearly-scoped "bot" account is different by design: it must be able
-- to decrypt Kenams's messages and reply automatically, so its NaCl secret key is
-- generated and held server-side (see apps/server/src/botStore.ts / bot_identities
-- below). This exception is limited to this one system account. No other account's
-- private key is ever stored or accessible server-side.
-- Safety net: `profiles.e2e_public_key` (X25519 public key, see
-- apps/mobile/src/lib/e2ee.ts) has been in production use since the direct-
-- message E2EE rollout but was never captured in a tracked migration file —
-- add it here idempotently so a fresh environment matches prod.
alter table public.profiles add column if not exists e2e_public_key text;

create table if not exists public.bot_identities (
  user_id uuid primary key references neon_auth."user"(id) on delete cascade,
  secret_key_b64 text not null,
  created_at timestamptz not null default now()
);

-- Server-only table: no Data API / RLS grants to `authenticated` at all — it must
-- never be reachable from any client, only from the backend's direct Postgres role.
alter table public.bot_identities enable row level security;
revoke all on public.bot_identities from authenticated;
