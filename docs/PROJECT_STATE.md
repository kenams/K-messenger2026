# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active integration
- `main` — documentation baseline only
- `bootstrap/platform` — implementation base
- `fix/feed-kmap-contact-security` — active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` — OPEN, DRAFT, mergeable
- keep PR #2 draft until remote authenticated Neon RLS validation and runtime migration are complete

## Latest verified checkpoint
- previous fully verified implementation commit: `ed1fae138550253c681358a31a4cf251e1db28f6`
- CI #106 on that commit: SUCCESS
- current auth migration head before this state update: `6bf6a224f60dd3d06b203b991bc121426a42f3d8`
- CI #111: `test` job SUCCESS (npm install, workspace typecheck, server tests); isolated local Alice/Bob/Charlie RLS job still running at last check

## Dedicated remote K-ssenger backend
Only the dedicated free Neon project `K-ssenger` (`late-flower-65059830`) may be used.

Re-verified on 2026-09-03:
- PostgreSQL 17, Europe (`aws-eu-central-1`)
- Neon Auth provider: Better Auth
- default branch: `main` / `br-falling-sea-b1k36u32`
- database: `kssenger`
- Neon Auth exposes a branch-specific JWKS URL and auth base URL
- core V1 tables live remotely: `profiles`, `privacy_settings`, `contacts`, `contact_requests`, `blocks`, `conversations`, `conversation_members`, `devices`, `messages`, `message_receipts`
- RLS is enabled on all ten public core V1 tables and policy presence/expressions were re-verified directly in PostgreSQL
- message persistence remains ciphertext-only and idempotent by `(sender_user_id, client_message_id)`

## Mobile Neon migration
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

## Server Neon Auth migration
Completed in current checkpoint:
- Socket.IO no longer calls `supabaseAdmin.auth.getUser(token)`
- `apps/server/src/auth.ts` verifies access tokens cryptographically against the configured Neon Auth remote JWKS using `jose`
- verified identity is derived only from the JWT `sub` claim after signature/issuer/time validation
- accepted signing algorithms are explicitly allow-listed
- malformed, oversized, invalid-signature or wrong-issuer tokens fail closed as `UNAUTHENTICATED`
- server config now requires `NEON_AUTH_JWKS_URL` and `NEON_AUTH_ISSUER`
- `.env.example` documents only public Neon auth endpoint settings and keeps secrets out of client code

Still transitional on server:
- persistence/authorization/social/group/message/receipt stores still use the historical Supabase admin client API as a data-access layer
- `@supabase/supabase-js`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` must remain until those call sites are migrated to Neon Postgres/Data API safely
- do not delete the historical data layer prematurely

## Branding / legal safety
- K-ssenger must remain independently branded and must not imply Microsoft/MSN affiliation
- do not ship Microsoft/MSN logos, copied visual assets or original sounds
- public attention feature name is `K-Pulse`; legacy `Wizz` may remain temporarily only as an internal protocol compatibility name until safely migrated
- perform trademark clearance for `K-ssenger` and key feature names before public commercial launch

## Immediate next task
1. Complete CI for the Neon socket auth migration and correct any regression.
2. Migrate server persistence away from Supabase admin assumptions to the dedicated Neon backend without weakening backend-only mutation rules.
3. Preserve atomic contact acceptance, block cleanup, group creation, ciphertext-only message persistence and receipt semantics.
4. Add authenticated remote Neon multi-user RLS proof on isolated test identities/branch when the tool surface can obtain real user sessions safely.
5. Wire mobile contacts -> presence -> K-Pulse -> direct messaging/receipts -> groups end-to-end.
6. Continue avatar/status, media/push, K-Feed/Moments/K-MAP, moderation, export/deletion and release polish.

## Hard rules
- K-ssenger resources only
- never force-push
- never expose secrets
- never reuse another project's backend
- never weaken authorization
- never invent custom cryptography
- keep PR #2 draft while critical security/database/runtime gates remain unresolved
- no production E2EE claim until a vetted native protocol is integrated and device-tested

## Build blocker
No verified Android Studio/Xcode/EAS signing environment or signing credentials are available through the current execution surface. Source/config/build preparation can continue, but a real signed mobile artifact requires available signing/tooling.
