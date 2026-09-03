# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active integration
- `main` — documentation baseline only
- `bootstrap/platform` — implementation base
- `fix/feed-kmap-contact-security` — active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` — OPEN, DRAFT, mergeable
- keep PR #2 draft until remote authenticated Neon RLS validation and runtime migration are complete

## Latest CI checkpoint
- CI #98 on commit `297e661c60d117ab57e6a38b602b947aab19f438`: SUCCESS
- current newer profile/Neon-client commits are triggering fresh CI runs; do not call them verified until those runs complete
- CI continues to run workspace typecheck, server tests, and the isolated Alice/Bob/Charlie RLS reference suite

## Dedicated remote K-ssenger backend
Only the dedicated free Neon project `K-ssenger` (`late-flower-65059830`) may be used.

Verified on 2026-09-03:
- PostgreSQL 17, Europe
- project active on the free plan
- Neon Auth (`better_auth`) active
- Neon Data API active for database `kssenger`, schema `public`
- JWT-aware helpers and authenticated/anonymous roles present
- current V1 tables live remotely: `profiles`, `privacy_settings`, `contacts`, `contact_requests`, `blocks`, `conversations`, `conversation_members`, `devices`, `messages`, `message_receipts`
- RLS enabled on the ten public V1 core tables with policy presence verified
- message persistence remains ciphertext-only and idempotent by `(sender_user_id, client_message_id)`

## Historical authorization reference
The historical Supabase migration chain remains only as an isolated local security/reference model for CI. It must never connect to or reuse another Supabase project.

## Security/hardening already implemented
- K-Feed server-side age gate
- K-MAP approximate recipients do not receive raw exact coordinates
- K-MAP shares revoked on block; Ghost Mode schema/revocation present
- contact acceptance atomic in historical server path
- profile reads restricted; invisible presence masked as offline externally
- direct conversation join/send block checks
- direct authenticated contact-request UPDATE removed
- pending requests cleaned on block
- receipt rows owner-readable only in historical reference path
- ciphertext-only message persistence, history and delivered/read receipt paths
- secure group creation with contact/block validation

## Contacts / presence / messaging / groups
Server-side historical implementation includes:
- contacts: search, request, accept, decline, cancel, remove, favorite, block cleanup
- presence: multi-socket tracking, last-socket offline, invisible masking, MSN-style login event and reconnect debounce
- messaging: idempotent ciphertext persistence, history replay, delivered/read receipts
- groups: atomic creation, owner + up to 49 invited contacts, block-safe validation, realtime create events

## Mobile Neon migration
The MSN-style visual identity is preserved.

Completed migration pieces:
- `apps/mobile/src/lib/neonConfig.ts` provides fail-closed dedicated Neon Auth/Data API endpoint configuration
- `apps/mobile/.env.example` contains public Neon endpoint placeholders only; no DB password/service secret belongs in the app
- mobile now depends on official `@neondatabase/neon-js`
- `apps/mobile/src/lib/backend.ts` is the explicitly named dedicated K-ssenger Neon client
- the Neon SDK compatibility auth adapter is used only as the SDK surface; it does not point to a Supabase project
- `useMyProfile.ts` now reads through `getBackend()`
- `ProfileBootstrapScreen.tsx` now writes/signs out through `getBackend()`
- legacy `supabase.ts` remains temporarily as a compatibility shim for remaining call sites; it already targets Neon Auth + Data API, not Supabase infrastructure

Still to migrate in mobile:
- `AuthScreen.tsx` naming/config labels and direct import
- `useAuthSession.ts` direct import
- remaining contacts/presence/Wizz/chat/groups UI/runtime call sites
- remove the compatibility shim once no imports remain

A direct write to the auth-session hook was blocked by the GitHub connector safety layer during this run. Do not bypass that by weakening auth; continue other safe work and retry only through allowed repository operations.

## Remaining V1 priorities
1. Complete mobile call-site migration to `getBackend()` and remove obsolete Supabase naming/shim.
2. Add authenticated end-to-end Neon Auth + Data API multi-user RLS tests on dedicated K-ssenger identities.
3. Migrate server persistence away from Supabase admin assumptions while preserving backend-only mutation rules.
4. Wire real mobile contacts, presence, Wizz, direct chat, groups, receipts, reconnect/offline behavior.
5. Complete profile avatar/status editing and group admin/member lifecycle.
6. Complete media/push, K-Feed vertical video, Moments, K-MAP privacy UX, moderation/report/block, account export/deletion.
7. Add release polish and signed Android/iOS builds when signing/tooling is actually available.
8. E2EE remains NOT claimed: only integrate a vetted native protocol and claim it after Android/iOS device proof.

## Handoff / hard rules
- K-ssenger resources only
- work from `fix/feed-kmap-contact-security`
- inspect PR #2 + CI before each run
- keep PR draft while critical DB/security/mobile gates remain unresolved
- never force-push
- never expose secrets
- never reuse another project's backend
- never weaken authorization to make migration easier
- never invent custom cryptography

## Build blocker
No verified Android Studio/Xcode/EAS signing environment or signing credentials are available through the current execution surface. Source/config/build preparation can continue, but a real signed mobile artifact requires available signing/tooling.
