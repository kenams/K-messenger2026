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
- GitHub Actions CI run #74 on commit `0161554980a25e571415de3a040195c5dae82e30` completed SUCCESS
- install: success
- TypeScript workspace typecheck: success
- server tests: success
- isolated local Supabase RLS integration job: success
- mobile-auth commits are newer than #74; fresh CI must pass before they are treated as verified

## Migrations — actually run locally (2026-09-03)
`supabase start` + `supabase db reset` on isolated K-ssenger ports applies the migration chain end to end. Fixed issues found by real execution include duplicate numbering, a missing membership helper, recursive `conversation_members` RLS causing PostgreSQL `42P17`, and later numbering drift.

`scripts/rls-integration-test.mjs` runs real Alice/Bob/Charlie authorization scenarios against local Postgres. Coverage includes profile privacy, presence masking, service-role RPC protection, K-Feed age gating, K-MAP precision isolation, receipt privacy/direct-write lockdown and block-triggered K-MAP revocation.

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
- RLS integration CI exercises the important rules against a real local Supabase instance

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

## Groups — current progress
- migration `0017_group_creation_rpc.sql` adds atomic service-role-only group creation
- group title and member-count validation added (owner + up to 49 invited members for beta)
- server group creation requires every invitee to already be a contact
- group creation rejects users blocked in either direction
- Socket.IO `group:create` + `group:created` flow added
- owner is inserted as `owner`, invitees as `member`, and default group settings are created atomically
- CI #74 verifies the current group path compiles/tests with the rest of the branch

## Mobile wiring — current progress
- existing MSN-style visual shell is preserved; no cosmetic rewrite
- dedicated Supabase client added using only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- no service-role/server secret is embedded in mobile code
- real persisted Supabase session hook added with auth-state subscription
- MSN-style login/signup screen added using `signInWithPassword` / `signUp`
- missing remote K-ssenger configuration is shown explicitly instead of silently reusing another project's backend
- Expo entrypoint now boots through an authenticated root; the MSN shell is only mounted after a real session exists
- these newest mobile-auth commits are waiting for fresh CI verification

## Remaining release blockers / priorities
1. Verify the new mobile auth/session entrypoint in CI, then wire real profile bootstrap and sign-out.
2. Connect a dedicated remote K-ssenger database/backend only; re-run migrations and RLS integration there.
3. Wire mobile contacts/presence/Wizz/chat/group calls to the authenticated backend and replace remaining local demo data progressively.
4. Complete profile/avatar/status editing, group admin/member lifecycle, K-Feed upload/moderation, K-MAP UX and Moments progressively.
5. Finish offline queue/retry semantics on the mobile client around the existing idempotent encrypted transport.
6. E2EE: select/integrate a vetted native protocol implementation and prove it on Android/iOS; do not claim production E2EE before this.
7. Produce signed/testable Android/iOS builds when build credentials/tooling are actually available.

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
