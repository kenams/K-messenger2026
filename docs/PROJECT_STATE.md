# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active integration
- `main` — documentation baseline only
- `bootstrap/platform` — implementation base (server, mobile shell, web beta)
- `fix/feed-kmap-contact-security` — active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` — OPEN, DRAFT, mergeable; keep draft until DB migrations are validated
- `import/mobile-agent-kah`, `import/server-agent-kah` — imported Agent-Kah crypto POC/history; not blindly merged

## Verified before latest contact-lifecycle commits
- GitHub Actions CI run #48 on commit `c521ec7` completed SUCCESS
- CI covers install, TypeScript typecheck and server tests

## Security/hardening completed on active branch
- K-Feed server-side age gate added
- K-MAP approximate recipients no longer receive raw exact coordinates
- K-MAP active shares revoked on block; Ghost Mode schema/revocation added
- Contact acceptance is atomic and service_role-only
- Profile reads restricted; invisible presence is masked as offline for non-owner viewers
- Direct 1:1 conversation join/send checks block state
- Direct authenticated contact-request UPDATE path removed
- Pending contact requests are cleaned up when either participant blocks the other

## Contact lifecycle now implemented server-side
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

## IMPORTANT UNVERIFIED LATEST CHANGES
The newest contact lifecycle commits were pushed after CI run #48. Fresh CI must pass before these changes are treated as verified.

## Remaining release blockers / priorities
1. Apply migrations to a dedicated K-ssenger Supabase project only; run live Alice/Bob/Charlie RLS/IDOR tests.
2. Presence: multi-socket connection counting, disconnect-to-offline, invisible-safe fanout, login-event debounce.
3. Reliable message receipts/offline delivery semantics without plaintext.
4. Wire the MSN-style mobile shell to real auth/contacts/presence/Wizz/chat backend.
5. E2EE: select/integrate a vetted native protocol implementation and prove it on Android/iOS; do not claim production E2EE before this.
6. Produce signed/testable Android/iOS builds when build credentials/tooling are available.

## Hard rules
- K-ssenger resources only; do not reuse or modify databases/deployments belonging to other projects.
- no force push
- no secrets in the public repository
- no custom Double Ratchet casually
- no production/E2EE/zero-bug claim without evidence

## Build blocker
No verified Android Studio/Xcode/EAS signing environment is available in this execution environment. A real installable mobile artifact requires available Expo/EAS or native signing credentials.
