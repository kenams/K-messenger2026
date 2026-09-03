# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active Integration
- `main` - documentation baseline only
- `bootstrap/platform` - implementation base
- `fix/feed-kmap-contact-security` - active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` - OPEN, DRAFT, mergeable as of the last GitHub check in this workspace
- keep PR #2 draft until authenticated remote Neon RLS validation and runtime V1 flow validation are complete

## Latest Verified GitHub State
- PR #2 checked from GitHub on 2026-09-03
- latest checked remote head before this local server-store migration rebase: `25929e9ad452da718f59b2f11ee3495a3852527f`
- CI run `33795052024` on that head: SUCCESS
- GitHub jobs in that run: `test` SUCCESS, `rls-integration` SUCCESS

## Dedicated Remote K-ssenger Backend
Only the dedicated free Neon project `K-ssenger` (`late-flower-65059830`) may be used.

Re-verified on 2026-09-03:
- PostgreSQL 17, Europe (`aws-eu-central-1`)
- Neon Auth provider: Better Auth
- default branch: `main` / `br-falling-sea-b1k36u32`
- database: `kssenger`
- Neon Auth exposes a branch-specific JWKS URL and auth base URL
- Neon Data API active for database `kssenger`, schema `public`
- core V1 tables live remotely: `profiles`, `privacy_settings`, `contacts`, `contact_requests`, `blocks`, `conversations`, `conversation_members`, `devices`, `messages`, `message_receipts`
- RLS is enabled on all ten public core V1 tables and policy presence/expressions were re-verified directly in PostgreSQL
- message persistence remains ciphertext-only and idempotent by `(sender_user_id, client_message_id)`

Current workspace blocker:
- Neon CLI is not authenticated locally (`profile list` reports only missing DEFAULT credentials)
- remote Neon RLS/runtime validation was not run in this pass because no usable Neon API credentials or remote DB URL were available through the environment
- do not use or infer any other Neon/Supabase/database resource

## Server Neon Migration
Verified locally in this pass:
- Socket.IO authentication no longer calls `supabaseAdmin.auth.getUser(token)`
- Socket.IO JWT validation uses `jose` with Neon Auth JWKS, issuer and audience checks
- socket identity is derived only from verified JWT `sub`; client-supplied `userId` is ignored for identity
- malformed token, invalid signature, wrong issuer, wrong audience, non-UUID subject and client-supplied `userId` spoof attempts are covered by unit tests
- server data access no longer imports or uses `@supabase/supabase-js`
- server runtime DB access uses `pg` with parameterized SQL through `apps/server/src/db.ts`
- contacts, contact requests, presence, K-Pulse authorization, conversations, messages, receipts and group creation server stores were migrated away from `supabaseAdmin`
- contact acceptance, blocking and group creation are transaction-backed
- `.github/workflows/ci.yml` now runs the RLS job against isolated Postgres 17 with the Neon migration, not Supabase CLI

Local validation completed before push:
- `npm run typecheck --workspaces --if-present` PASS
- `npm run test:server` PASS, 18/18 tests
- `scripts/neon-rls-integration-test.mjs` PASS locally against a disposable Postgres 17 container, 19/19 checks

## Mobile Neon Migration
Completed:
- official `@neondatabase/neon-js` client in mobile
- fail-closed Neon Auth/Data API public endpoint configuration
- `backend.ts` is the explicit K-ssenger Neon client
- profile reads/bootstrap/sign-out use `getBackend()`
- `AuthScreen.tsx` uses `getBackend()` and Neon env labels
- `useAuthSession.ts` uses `getBackend()`
- obsolete `apps/mobile/src/lib/supabase.ts` compatibility shim removed
- product-facing auth copy no longer says `MSN revient`

Remaining mobile work:
- wire real contacts, presence, K-Pulse, direct chat, groups and receipts to Neon-backed runtime
- profile avatar/status editing
- media, push, K-Feed, Moments, K-MAP, moderation, account export/deletion

## Branding / Legal Safety
- K-ssenger must remain independently branded and must not imply Microsoft/MSN affiliation
- do not ship Microsoft/MSN logos, copied visual assets or original sounds
- public attention feature name is `K-Pulse`; legacy Wizz naming may remain temporarily only as an internal protocol compatibility detail until safely migrated
- perform trademark clearance for `K-ssenger` and key feature names before public commercial launch

## Remaining V1 Priorities
1. run authenticated Alice/Bob/Charlie validation against the dedicated remote Neon project
2. wire mobile contacts -> presence -> K-Pulse -> direct messaging/receipts -> groups end to end
3. complete profile avatar/status editing
4. complete media + push
5. complete K-Feed + Moments + K-MAP on Neon-backed storage/runtime
6. complete moderation/report/block UX + export/delete account
7. prepare Android/iOS builds when signing/tooling is available
8. no production E2EE claim until a vetted native protocol is integrated and device-tested

## Hard Rules
- K-ssenger resources only
- never force-push
- never expose secrets
- never reuse another project's backend
- never weaken authorization
- never invent custom cryptography
- keep PR #2 draft while critical security/database/runtime gates remain unresolved
- no production E2EE claim until a vetted native protocol is integrated and device-tested

## Build Blocker
No verified Android Studio/Xcode/EAS signing environment or signing credentials are available through the current execution surface. Source/config/build preparation can continue, but a real signed mobile artifact requires available signing/tooling.
