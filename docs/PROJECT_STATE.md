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
- server tests: success

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
1. Apply migrations to a dedicated K-ssenger database/backend only; run live Alice/Bob/Charlie RLS/IDOR tests.
2. Expand Alice/Bob/Charlie authorization coverage around contact lifecycle, blocks, receipts, K-MAP and feed visibility.
3. Finish offline message delivery/replay semantics without plaintext.
4. Wire the MSN-style mobile shell to real auth/contacts/presence/Wizz/chat backend.
5. Complete groups, profile/avatar/status flows, Moments, K-Feed upload/moderation and K-MAP UX progressively.
6. E2EE: select/integrate a vetted native protocol implementation and prove it on Android/iOS; do not claim production E2EE before this.
7. Produce signed/testable Android/iOS builds when build credentials/tooling are available.

## Database/backend blocker
No dedicated live K-ssenger database has been verified in this execution context. Do not reuse or modify databases belonging to other projects. Supabase-style migrations in this repository therefore remain unapplied/unvalidated against production-like infrastructure.

## Hard rules
- K-ssenger resources only; do not reuse or modify databases/deployments belonging to other projects.
- no force push
- no secrets in the public repository
- no custom Double Ratchet casually
- no production/E2EE/zero-bug claim without evidence

## Build blocker
No verified Android Studio/Xcode/EAS signing environment is available in this execution environment. A real installable mobile artifact requires available Expo/EAS or native signing credentials.
