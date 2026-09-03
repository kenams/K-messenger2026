# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active integration
- `main` — documentation baseline only
- `bootstrap/platform` — implementation base (server, mobile shell, web beta)
- `fix/feed-kmap-contact-security` — active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` — OPEN, DRAFT, mergeable; keep draft until remote auth/RLS and mobile integration are validated
- `import/mobile-agent-kah`, `import/server-agent-kah` — imported Agent-Kah crypto POC/history; not blindly merged

## Latest verified CI
- GitHub Actions CI run #90 on commit `8dc8c7fe7633752188fbfd7d1341181e5e7a0e1c` completed SUCCESS
- install: success
- TypeScript workspace typecheck: success
- server tests: success
- isolated local Supabase RLS integration job: success

## Dedicated remote K-ssenger backend
A dedicated free Neon project named `K-ssenger` exists and is the only remote database/backend allowed for this project.

Provisioned and verified:
- PostgreSQL 17, Europe
- Neon Auth (`better_auth`) is active on the default `main` branch
- Neon Data API is active and bound to the `kssenger` database
- JWT-aware database helpers `auth.user_id()` and `auth.session()` are present
- Data API roles `authenticated` / `anonymous` exist
- the complete current V1 core table set from `neon/migrations/0001_v1_core.sql` exists remotely: `profiles`, `privacy_settings`, `contacts`, `contact_requests`, `blocks`, `conversations`, `conversation_members`, `devices`, `messages`, `message_receipts`
- RLS is enabled on all ten public V1 core tables and policy presence has been verified directly in PostgreSQL
- profile self-write/contact-read restrictions are live
- privacy settings are self-only
- contacts are owner-readable while contact mutation remains backend-controlled
- contact requests are participant-readable and sender-creatable; status mutation remains backend-controlled
- blocks are owner-controlled
- conversations/members/messages/receipts are member-readable while mutation remains backend-controlled
- devices are self-controlled
- message persistence remains ciphertext-only in schema and is idempotent by `(sender_user_id, client_message_id)`

The full current Neon V1 core schema is versioned in `neon/migrations/0001_v1_core.sql`. The remaining remote database gate is authenticated end-to-end Neon Auth/Data API authorization testing with multiple real test identities, followed by moving runtime server/mobile calls off Supabase-specific APIs.

## Historical Supabase validation
The historical Supabase migration chain remains useful as the security/reference model and passes the isolated local Alice/Bob/Charlie RLS integration suite. It must not be connected to or reuse any unrelated Supabase project.

## Security/hardening completed on active branch
- K-Feed server-side age gate added
- K-MAP approximate recipients no longer receive raw exact coordinates
- K-MAP active shares revoked on block; Ghost Mode schema/revocation added
- Contact acceptance is atomic and service_role-only in the historical server path
- Profile reads restricted; invisible presence is masked as offline for non-owner viewers
- Direct 1:1 conversation join/send checks block state
- Direct authenticated contact-request UPDATE path removed
- Pending contact requests are cleaned up when either participant blocks the other
- receipt rows are owner-readable only and authenticated clients cannot create them directly in the historical path
- RLS integration CI exercises important authorization rules against a real isolated local Supabase instance

## Contact lifecycle implemented server-side
- list contacts
- list pending sent/received requests
- username search
- request contact with self/block/existing/pending checks
- accept / decline / cancel
- remove contact mutually
- set/unset favorite per owner
- block removes mutual contact and cancels pending requests
- realtime Socket.IO events added for these actions

## Presence hardening implemented
- per-user multi-socket connection tracking
- disconnect only marks a user offline when their last socket disconnects
- invisible is always fanned out to contacts as offline
- MSN-style `presence:login` event emitted only on offline -> visible transition
- 30-second login debounce avoids reconnect storms

## Messaging reliability progress
- ciphertext-only message persistence remains idempotent by client message id
- delivered/read receipt path added without plaintext payloads
- encrypted history replay added with membership/block checks and deterministic cursor semantics

## Groups — current progress
- atomic service-role-only group creation exists in historical path
- owner + up to 49 invited members
- invitees must be contacts; blocks reject creation
- Socket.IO `group:create` + `group:created` flow added

## Mobile wiring — current progress
- existing MSN-style visual shell is preserved; no cosmetic rewrite
- persisted session root, login/signup UI, profile bootstrap and sign-out flow exist
- legacy runtime still uses Supabase APIs and is not allowed to target a remote Supabase project
- Neon migration has now started: `apps/mobile/src/lib/neonConfig.ts` defines fail-closed dedicated Neon Auth/Data API public endpoint configuration
- `apps/mobile/.env.example` documents only public Neon service URLs; no database credential or secret is required/allowed there
- next code step is replacing `useAuthSession`, `AuthScreen`, profile reads/writes, then contacts with official Neon Auth/Data API semantics

## Remaining V1 blockers / priorities
1. Add authenticated end-to-end Neon Auth + Data API authorization tests using dedicated K-ssenger test identities; prove cross-user RLS isolation remotely.
2. Replace Supabase-specific mobile auth/data client assumptions with Neon Auth + Neon Data API.
3. Move backend contact/chat/group/presence persistence from Supabase admin calls to the dedicated Neon database while preserving authorization guarantees.
4. Wire mobile contacts/presence/Wizz/chat/groups to the authenticated remote backend and remove remaining local demo data.
5. Complete profile/avatar/status editing, group admin/member lifecycle, K-Feed upload/moderation, K-MAP UX and Moments.
6. Finish offline queue/retry semantics around the idempotent encrypted transport.
7. Add push/media and account export/deletion flows with privacy-safe defaults.
8. E2EE: select/integrate a vetted native protocol implementation and prove it on Android/iOS; do not claim production E2EE before this.
9. Produce signed/testable Android/iOS builds when signing/tooling is actually available.

## Handoff checkpoint
- Continue ONLY K-ssenger.
- Work from `fix/feed-kmap-contact-security` unless explicitly changed.
- Inspect PR #2 and CI before each run; keep commits small and coherent.
- Keep PR #2 draft while critical DB/security/mobile integration gates remain unresolved.
- Never force-push, expose secrets, or reuse another project's backend.
- Dedicated backend is Neon project `K-ssenger` only.
- Current priority: finish official Neon mobile auth/Data API wiring, prove remote multi-user RLS, then wire real contacts/presence/Wizz/chat/groups.

## Hard rules
- K-ssenger resources only
- no force push
- no secrets in the public repository
- no custom Double Ratchet casually
- no production/E2EE/zero-bug claim without evidence

## Build blocker
No verified Android Studio/Xcode/EAS signing environment is available in this execution environment. A real installable mobile artifact requires available Expo/EAS or native signing credentials.
