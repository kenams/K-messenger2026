# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Branches
- `main` — docs only
- `bootstrap/platform` — real implementation (server, mobile, web beta), verified: typecheck clean, 6/6 server tests green
- `import/mobile-agent-kah`, `import/server-agent-kah` — Agent-Kah's prior local-only work (crypto primitives POC), imported, NOT yet merged/integrated
- `fix/feed-kmap-contact-security` (HEAD) — 3 real security gaps found+fixed, NOT yet merged to bootstrap/platform, PR not opened

## DONE ON bootstrap/platform (verified, not just claimed)
- Node/TS/Socket.IO server: Supabase JWT auth, conversation membership authz, device ownership/revocation check, ciphertext-only DTO validation, rate limiting, log redaction, helmet/CORS/body-size hardening
- Core schema + RLS, K-MAP schema, K-Feed schema
- web beta (auth/contacts/realtime chat/Wizz) deployed on Vercel

## DONE THIS SESSION (fix/feed-kmap-contact-security, commit be6b282)
- K-Feed: age_rating was NOT enforced server-side on read (client-filter-only bug) → fixed via `viewer_max_age_rating()` + rewritten SELECT policy (0008)
- K-MAP: `location_points` exposed exact lat/lon to any authorized recipient regardless of share.precision='approximate' → fixed via owner-only direct SELECT + `location_point_for_viewer()` RPC that coarsens to ~1.1km when approximate (0009)
- Contacts: `acceptContact` was 2 non-atomic service-role calls → now 1 RPC `accept_contact_request` (0010), social.ts updated
- apps/server: typecheck clean, 6/6 tests still green
- Migrations 0008/0009/0010 written+reviewed, NOT applied to any live Postgres (no DB access from this environment)

## KNOWN GAP, NOT FIXED YET (noted in 0009 RPC comment)
Active location_shares are not auto-revoked when either party blocks the other or toggles Ghost Mode. Needs a trigger on blocks insert + a ghost-mode flag check. Scoped out to keep the precision-leak fix small.

## CURRENT PRIORITY (per master spec order)
AUTH -> AUTHORIZATION -> RLS -> CONTACTS -> PRESENCE -> E2EE -> CHAT -> OFFLINE -> WIZZ -> PUSH -> MEDIA -> K-MAP -> GROUPS -> CALLS -> MOMENTS -> COMMUNITIES -> RELEASE

Auth/authorization/RLS/contacts foundation is largely real and tested on `bootstrap/platform`. Next real gaps to close (not yet done):
- Apply migrations 0008-0010 against an actual Supabase project + RLS integration tests (Alice/Bob/Charlie IDOR suite) — needs live DB, not available in this environment
- location_shares auto-revoke on block/ghost-mode
- E2EE session protocol still unselected/unproven on device (see import branches + K-ssenger-mobile local docs/CRYPTO_DECISION.md: libolm rejected, vodozemac/libsignal-native-bridge feasibility spike still pending, no compiled Android/iOS POC exists anywhere)
- Merge/integrate import/mobile-agent-kah and import/server-agent-kah into bootstrap/platform deliberately (not done — imported only)

## DO NOT
- force push over main or bootstrap/platform
- discard commit history
- copy private keys/secrets/.env into the repo
- claim production E2EE until native implementation + device tests pass
- implement a custom Double Ratchet casually

## BUILD_BLOCKER
No Android Studio / Xcode / EAS access in this environment → no compiled mobile build possible here. Real device/EAS build needs Kenams' machine or EAS cloud (Expo account).
