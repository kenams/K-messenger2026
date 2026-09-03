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
- GitHub Actions CI run #86 on commit `dd205f149daf133fe6baeb9a95fdbd7a9025e710` completed SUCCESS
- install: success
- TypeScript workspace typecheck: success
- server tests: success
- isolated local Supabase RLS integration job: success

## Dedicated remote K-ssenger backend
A dedicated free Neon project named `K-ssenger` now exists and is the only remote database/backend allowed for this project.

Provisioned and verified:
- PostgreSQL 17, Europe
- Neon Auth with email/password sign-up enabled
- Neon Data API bound to Neon Auth
- JWT-aware database helpers `auth.user_id()` and `auth.session()` are present
- Data API roles `authenticated` / `anonymous` exist
- first live V1 tables now exist remotely: `profiles`, `privacy_settings`, `contacts`
- RLS is enabled on all three live tables
- `profiles` currently has self insert/update plus self-or-contact read policy
- `privacy_settings` is self-only
- `contacts` is owner-read-only from the client; mutation remains backend-controlled
- authenticated grants are restricted accordingly

The full intended Neon V1 schema is now versioned in `neon/migrations/0001_v1_core.sql`. It is deliberately separate from historical Supabase migrations while the backend is migrated safely. The complete migration has NOT yet been applied remotely in one shot: bulk execution was blocked by the tool safety layer, so the migration is being applied and verified incrementally rather than bypassing safeguards.

## Historical Supabase validation
The existing Supabase migration chain remains useful as the security/reference model and still passes the isolated local Alice/Bob/Charlie RLS integration suite. It must not be connected to or reuse any unrelated Supabase project.

## Security/hardening completed on active branch
- K-Feed server-side age gate added
- K-MAP approximate recipients no longer receive raw exact coordinates
- K-MAP active shares revoked on block; Ghost Mode schema/revocation added
- Contact acceptance is atomic and service_role-only in the historical server path
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

## Mobile wiring — current progress
- existing MSN-style visual shell is preserved; no cosmetic rewrite
- current mobile auth/session implementation still uses the Supabase client API and must be migrated to Neon Auth before remote use
- persisted session root exists
- MSN-style login/signup screen exists
- real profile bootstrap / sign-out flow exists on the current branch
- the app refuses to silently reuse another project's backend

## Remaining V1 blockers / priorities
1. Finish applying the versioned Neon V1 schema incrementally and verify Neon RLS with real authenticated requests.
2. Replace Supabase-specific mobile auth/data client assumptions with Neon Auth + Neon Data API.
3. Move backend contact/chat/group/presence persistence from Supabase admin calls to the dedicated Neon database while preserving authorization guarantees.
4. Wire mobile contacts/presence/Wizz/chat/groups to the authenticated remote backend and remove remaining local demo data.
5. Complete profile/avatar/status editing, group admin/member lifecycle, K-Feed upload/moderation, K-MAP UX and Moments.
6. Finish offline queue/retry semantics around the idempotent encrypted transport.
7. E2EE: select/integrate a vetted native protocol implementation and prove it on Android/iOS; do not claim production E2EE before this.
8. Produce signed/testable Android/iOS builds when signing/tooling is actually available.

## Claude handoff checkpoint
- Read this file first before changing anything.
- Continue ONLY K-ssenger. Do not touch MyLife, Kah-Digital, DSE, or any unrelated repository/database/deployment.
- Work from `fix/feed-kmap-contact-security` unless the user explicitly asks for another branch.
- Keep commits small, descriptive, and pushed to GitHub frequently so another agent can resume safely.
- Before each work session: pull/fetch current branch, inspect PR #2 and latest CI, then continue from the newest commit instead of replaying older work.
- Keep PR #2 draft while critical DB/security/mobile integration gates remain unresolved.
- Do not force-push.
- Do not commit secrets, Neon credentials, JWTs, signing keys, service-role keys, `.env` files, or connection strings.
- Dedicated backend is Neon project `K-ssenger` only. Never reuse another project's database.
- Current handoff priority: migrate mobile + server away from Supabase-specific runtime assumptions to Neon Auth/Data API safely, then finish real multi-user chat/contact/presence/group flows.
- Update this `PROJECT_STATE.md` at meaningful checkpoints so ChatGPT/Claude/Codex can hand off without losing context.

## Hard rules
- K-ssenger resources only; do not reuse or modify databases/deployments belonging to other projects
- no force push
- no secrets in the public repository
- no custom Double Ratchet casually
- no production/E2EE/zero-bug claim without evidence

## Build blocker
No verified Android Studio/Xcode/EAS signing environment is available in this execution environment. A real installable mobile artifact requires available Expo/EAS or native signing credentials.
