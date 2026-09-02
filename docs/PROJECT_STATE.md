# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Product
K-ssenger — MSN 2027 + messagerie moderne sécurisée + K-MAP social GPS.

## DONE IN GITHUB
- Product vision
- UX specification
- K-MAP specification
- Acceptance test plan
- Target architecture
- Security/privacy model

## DONE LOCALLY BY AGENT-KAH — TO IMPORT
Reported local work, not yet verified in this repository:
- mobile commits bb24d50 + d971524
- server commit ac25216
- Device identity Ed25519/X25519
- SecureKeyStore
- CryptoProvider/libsodium primitives
- legacy AES isolated
- mobile crypto tests 14/14
- Node/TypeScript/Socket.IO server
- ciphertext-only contract
- Supabase schema/RLS draft
- Wizz rate limiting
- server tests 7/7

These claims must be verified after import; do not recreate blindly.

## CURRENT PRIORITY
Import Agent-Kah local repositories/branches into this GitHub repository without losing history, then fix server authentication/authorization findings before wiring real messaging.

## SECURITY BLOCKERS REPORTED
- authentication placeholder/broken
- authorization missing/incomplete
- potential IDOR/spoofing
- E2EE session protocol implementation not yet selected/proven on Android+iOS

## NEXT EXACT ACTION
Agent-Kah should add this GitHub repository as remote and push its existing mobile/server history to dedicated import branches (for example `import/mobile-agent-kah` and `import/server-agent-kah`) without force-pushing main. Then inspect diffs and integrate into the target monorepo deliberately.

## DO NOT
- force push over main
- discard local commit history
- copy private keys/secrets/.env
- claim production E2EE until native implementation and device tests pass
- implement a custom ratchet casually

## AFTER IMPORT
AUTH -> AUTHORIZATION -> RLS -> CONTACTS -> PRESENCE -> E2EE -> CHAT -> OFFLINE -> WIZZ -> PUSH -> MEDIA -> K-MAP -> GROUPS -> CALLS -> MOMENTS -> COMMUNITIES -> RELEASE
