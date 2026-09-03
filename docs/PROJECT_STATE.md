# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active integration
- `main` — documentation baseline only
- `bootstrap/platform` — implementation base (server, mobile shell, web beta)
- `fix/feed-kmap-contact-security` — active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` — OPEN, DRAFT, mergeable; keep draft until DB migrations are validated
- `import/mobile-agent-kah`, `import/server-agent-kah` — imported Agent-Kah crypto POC/history; not blindly merged

## Latest verified CI
- GitHub Actions CI run #69 on commit `dc564f67d72c810f128d09122a9e125d9b65c355` completed SUCCESS
- install: success
- TypeScript typecheck: success
- server tests: success
- real local Supabase RLS integration job: success
- latest group commits are newer than #69; fresh CI is running and must pass before they are treated as verified

## Migrations — actually run locally (2026-09-03)
`supabase start` + `supabase db reset` (Docker, isolated K-ssenger ports) applied the migration chain end to end. Static review previously missed real issues that were fixed before continuing:
- duplicate migration numbering
- missing `public.is_conversation_member(uuid)` helper
- recursive `conversation_members` RLS policy causing PostgreSQL `42P17`
- subsequent migration numbering collision after parallel integration

`scripts/rls-integration-test.mjs` runs real Alice/Bob/Charlie scenarios against local Postgres. The verified #69 version covers profile privacy, presence masking, service-role RPC protection, K-Feed age gating, K-MAP precision isolation, receipt privacy/direct-write lockdown, and block-triggered K-MAP revocation.

Still not done: no dedicated remote K-ssenger database/backend is connected yet. Local validation is real, but remote staging validation is still required before production claims.

## Security/hardening completed on active branch
- K-Feed server-side age gate added
- K-MAP approximate recipients no longer receive raw exact coordinates
- K-MAP active shares revoked on block; Ghost Mode schema/revocation added
- Contact acceptance is atomic and service_role-only
- Profile reads restricted; invisible presence is masked as offline for non-owner viewers
- Direct 1:1 conversation join/send checks block state
- Direct authenticated contact-request UPDATE path removed
- Pending contact requests are cleaned up when either participant blocks the other
- receipt rows are owner-readable only and authenticated clients cannot create them directly
- RLS integration CI now exercises these rules against a real local Supabase instance

## Contact lifecycle implemented server-side
- list contacts
- list pending sent/received requests
- username search
- request contact with self/block/existing/pending checks
- accept
- decline
- cancel outgoing request
- remove contact mutually
- set/unset favorite per owner
- block removes mutual contact and cancels pending requests
- realtime Socket.IO events added for these actions
- migration `0016_contact_lifecycle.sql` adds secure pending-pair/index constraints

## Presence hardening implemented
- per-user multi-socket connection tracking
- disconnect only marks a user offline when their last socket disconnects
- invisible is always fanned out to contacts as offline
- explicit presence updates are broadcast only to contact audience plus self state
- MSN-style `presence:login` event is emitted only on offline -> visible transition
- login event has a 30-second debounce to avoid reconnect storms
- unit coverage added for multi-socket disconnect semantics, invisible masking and login debounce

## Messaging reliability progress
- ciphertext-only message persistence remains idempotent by client message id
- delivered/read receipt path added without plaintext payloads
- encrypted history replay added with membership/block checks, pagination and deterministic cursor semantics
- no plaintext body is introduced by history/receipt transport
- CI #68 verified encrypted history changes; CI #69 verified the expanded RLS suite

## Groups — current progress
- migration `0017_group_creation_rpc.sql` adds atomic service-role-only group creation
- group title and member-count validation added (owner + up to 49 invited members for beta)
- server group creation requires every invitee to already be a contact
- group creation rejects users blocked in either direction
- Socket.IO `group:create` + `group:created` flow added
- owner is inserted as `owner`, invitees as `member`, and default group settings are created atomically
- these newest group commits are still waiting for the current CI/RLS run to finish

## Remaining release blockers / priorities
1. Finish verification of the new group migration/server path in CI and add group-specific Alice/Bob/Charlie tests.
2. Connect a dedicated remote K-ssenger database/backend only; re-run migrations and RLS integration there.
3. Wire the MSN-style mobile shell to real auth/contacts/presence/Wizz/chat/group backend.
4. Complete profile/avatar/status editing, group admin/member lifecycle, K-Feed upload/moderation, K-MAP UX and Moments progressively.
5. Finish offline queue/retry semantics on the mobile client around the existing idempotent encrypted transport.
6. E2EE: select/integrate a vetted native protocol implementation and prove it on Android/iOS; do not claim production E2EE before this.
7. Produce signed/testable Android/iOS builds when build credentials/tooling are available.

## Database/backend blocker
No dedicated remote K-ssenger database is connected yet. Do not reuse, pause, modify or repurpose databases belonging to other projects. Local Supabase exists only as an isolated K-ssenger validation environment.

## Hard rules
- K-ssenger resources only; do not reuse or modify databases/deployments belonging to other projects
- no force push
- no secrets in the public repository
- no custom Double Ratchet casually
- no production/E2EE/zero-bug claim without evidence

## Build blocker
No verified Android Studio/Xcode/EAS signing environment is available in this execution environment. A real installable mobile artifact requires available Expo/EAS or native signing credentials.
