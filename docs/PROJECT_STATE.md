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
- latest implementation commit: `ed1fae138550253c681358a31a4cf251e1db28f6`
- CI #106 on that commit: SUCCESS
- CI runs workspace typecheck, server tests and the isolated Alice/Bob/Charlie RLS reference suite

## Dedicated remote K-ssenger backend
Only the dedicated free Neon project `K-ssenger` (`late-flower-65059830`) may be used.

Verified on 2026-09-03:
- PostgreSQL 17, Europe
- Neon Auth (`better_auth`) active
- Neon Data API active for database `kssenger`, schema `public`
- core V1 tables live remotely: `profiles`, `privacy_settings`, `contacts`, `contact_requests`, `blocks`, `conversations`, `conversation_members`, `devices`, `messages`, `message_receipts`
- RLS enabled on all ten public core V1 tables with policy presence verified
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

## Branding / legal safety
- K-ssenger must remain independently branded and must not imply Microsoft/MSN affiliation
- do not ship Microsoft/MSN logos, copied visual assets or original sounds
- public attention feature name is `K-Pulse`; legacy `Wizz` may remain temporarily only as an internal protocol compatibility name until safely migrated
- perform trademark clearance for `K-ssenger` and key feature names before public commercial launch

## Current critical server blocker
`apps/server/src/auth.ts` still authenticates socket access tokens through the historical `supabaseAdmin.auth.getUser(token)` path. The server package still depends on `@supabase/supabase-js`.

## Immediate next task for Codex
1. Work only on `fix/feed-kmap-contact-security`.
2. Inspect current Neon Auth documentation/config already available to the project and migrate server socket authentication away from `supabaseAdmin.auth.getUser(token)` to verified Neon Auth token identity.
3. Derive the socket user ID only from the verified token/session. Never trust a client-provided user ID.
4. Fail closed when issuer/JWKS/auth config is missing or invalid.
5. Use a vetted JWT/JWKS verification path or official Neon-supported mechanism; do not invent cryptography.
6. Preserve existing server tests and add tests for invalid token, wrong issuer/audience if applicable, malformed token and verified identity extraction.
7. Then remove server Supabase runtime/admin dependencies only after all call sites are migrated.
8. Run CI and keep PR #2 draft.
9. After server auth is green, perform authenticated Alice/Bob remote Neon RLS validation, then wire contacts -> presence -> K-Pulse -> direct messaging/receipts -> groups.

## Remaining V1 priorities after server auth
1. authenticated Neon multi-user RLS proof
2. real contacts/presence/K-Pulse/chat/groups end-to-end
3. media + push
4. K-Feed + Moments + K-MAP
5. moderation/report/block + export/delete
6. release polish and Android/iOS builds when signing/tooling is available
7. no production E2EE claim until a vetted native protocol is integrated and device-tested

## Hard rules
- K-ssenger resources only
- never force-push
- never expose secrets
- never reuse another project's backend
- never weaken authorization
- never invent custom cryptography
- keep PR #2 draft while critical security/database/runtime gates remain unresolved

## Build blocker
No verified Android Studio/Xcode/EAS signing environment or signing credentials are available through the current execution surface. Source/config/build preparation can continue, but a real signed mobile artifact requires available signing/tooling.
