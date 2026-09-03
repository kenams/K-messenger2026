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
- GitHub Actions CI run #61 on commit `aad9780f41fd9df16404de94baf1ace545afff29` completed SUCCESS
- install: success
- TypeScript typecheck: success
- server tests: success (10/10 after merge, includes presence-runtime suite)

## Migrations — now actually run, not just reviewed (2026-09-03)
`supabase start` + `supabase db reset` (Docker, local) applied all 16
migrations end to end for the first time. Found and fixed 3 real bugs static
review had missed:
- 0006 had two files sharing that prefix -> migration apply fails (renumbered)
- a migration called `public.is_conversation_member(uuid)`, never defined
  anywhere -> undefined function error (added it)
- **CRITICAL**: `conversation_members`'s own "membership member read" RLS
  policy referenced `conversation_members` from inside its own USING clause
  -> infinite recursion (42P17) on ANY authenticated read touching that
  table, including indirectly. This was live in `bootstrap/platform` /
  0001_core.sql since the start and untested until now. Fixed via
  `0015_conversation_members_recursion_fix.sql`.
- A second numbering collision appeared after merging Codex's parallel
  commits (both sides used 0012/0013) — renumbered again to 0012-0016,
  re-verified.

`scripts/rls-integration-test.mjs` — real Alice/Bob/Charlie suite against
the live local Postgres (not vitest, needs a DB): stranger vs contact
profile reads, presence column lockdown + invisible masking,
accept_contact_request service_role lock, K-Feed age gate (13 default, 18
enforced, owner bypass), K-MAP approximate-vs-precise coordinate exposure.
**11/11 passing.** Run it yourself: `npx supabase start` (uses ports
55321-55329, MyLife's local stack already occupies 54321-54327) then
`node scripts/rls-integration-test.mjs`.

Still not done: no dedicated *remote* Supabase/staging project exists yet
(see Database/backend blocker below) — only validated locally so far.

## Security/hardening completed on active branch
- K-Feed server-side age gate added
- K-MAP approximate recipients no longer receive raw exact coordinates
- K-MAP active shares revoked on block; Ghost Mode schema/revocation added
- Contact acceptance is atomic and service_role-only
- Profile reads restricted; invisible presence is masked as offline for non-owner viewers
- Direct 1:1 conversation join/send checks block state
- Direct authenticated contact-request UPDATE path removed
- Pending contact requests are cleaned up when either participant blocks the other

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
- migration `0015_contact_lifecycle.sql` adds secure pending-pair/index constraints

## Presence hardening now implemented
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
- receipt TypeScript failure fixed with type-safe upsert branches
- CI #61 verifies the current server compiles and tests pass

## Remaining release blockers / priorities
1. DONE locally (see Migrations section above) — still need a dedicated *remote* K-ssenger Supabase project to apply these against and re-verify there.
2. Expand Alice/Bob/Charlie authorization coverage around contact lifecycle, blocks, receipts, K-MAP and feed visibility (current suite covers the fixes made so far, not every path).
3. Finish offline message delivery/replay semantics without plaintext.
4. Wire the MSN-style mobile shell to real auth/contacts/presence/Wizz/chat backend.
5. Complete groups, profile/avatar/status flows, Moments, K-Feed upload/moderation and K-MAP UX progressively.
6. E2EE: select/integrate a vetted native protocol implementation and prove it on Android/iOS; do not claim production E2EE before this.
7. Produce signed/testable Android/iOS builds when build credentials/tooling are available.

## Database/backend blocker
No dedicated *remote* K-ssenger Supabase project exists/was found (searched repo + full git history for Neon/DATABASE_URL/PGHOST — none; see docs/DATABASE_DECISION.md). Migrations ARE now validated against a real local Postgres (Docker + Supabase CLI, see above) but not against any live remote project. Do not reuse or modify databases belonging to other projects (e.g. the unrelated `MyLife` local Supabase stack that happens to run on this same machine — ports were deliberately shifted to 55321-55329 to avoid colliding with it, never touch its data).

## Hard rules
- K-ssenger resources only; do not reuse or modify databases/deployments belonging to other projects.
- no force push
- no secrets in the public repository
- no custom Double Ratchet casually
- no production/E2EE/zero-bug claim without evidence

## Build blocker
No verified Android Studio/Xcode/EAS signing environment is available in this execution environment. A real installable mobile artifact requires available Expo/EAS or native signing credentials.
