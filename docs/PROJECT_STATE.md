# PROJECT STATE

## Repository
- Repository: `kenams/K-messenger2026`
- Active branch: `fix/feed-kmap-contact-security`
- Base: `bootstrap/platform`
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT.
- Keep PR #2 draft until database, security, multi-device, media/push and release gates are proven.

## Latest verified GitHub state
Verified 2026-09-04:
- CI #222 on `8f1d9c53d95f359022884bc59661d3713dc63d99`: SUCCESS.
- No concurrent push replaced the active branch before this run.
- `35d47c69465ed1aadcc69c98e06651e73040d7bd` hardens `0006_group_moderation.sql`: authenticated Data API clients no longer receive direct SELECT/INSERT/UPDATE/DELETE privileges on `group_bans`; owner/admin ban-list access remains server-authorized through the authenticated realtime endpoint.
- `e7bec2930ac7392386e072b747c2d27bccef94c2` adds corrective migration `0007_group_bans_server_only.sql` so databases that evaluated an earlier `0006` draft are hardened too.
- CI #224 on `e7bec2930ac7392386e072b747c2d27bccef94c2` is in progress and is not yet release-validated.
- No force-push was used.

## Agent-Kah branch review
- `import/mobile-agent-kah` head remains `d97152456f7bf668a13f29d19d2c742538c5cafa` from 2026-09-02.
- `import/server-agent-kah` head remains `ac25216a2f572e53973b14c12b75a34ec2441732` from 2026-09-02.
- Neither branch is newer than the active V1 branch. Do not merge the old server branch wholesale because it used Supabase persistence assumptions and placeholder handshake auth that were replaced by Neon/Postgres + verified Neon Auth JWT identity.

## Dedicated Neon backend
Only project `K-ssenger` (`late-flower-65059830`) is allowed.

Re-verified 2026-09-04:
- PostgreSQL 17
- region `aws-eu-central-1`
- plan `free_v3`
- default branch `main`: `br-falling-sea-b1k36u32`
- main was not modified during this run
- no other Neon project was touched

### Prepared moderation migration
The earlier temp migration branch `br-gentle-union-b1dttksj` contains the older draft and must not be promoted.

A new hardened migration was prepared on temporary branch `br-lively-bonus-b16vbnze` from `main` and verified read-only:
- partial unique single-owner index: present
- `conversation_members.muted_until`: present
- `group_bans`: present
- `group_bans` RLS: enabled
- authenticated Data API SELECT on `group_bans`: revoked
- authenticated Data API INSERT on `group_bans`: revoked
- obsolete `group_bans_member_read` policy: absent

This hardened migration is NOT applied to main. Promotion or cleanup through Neon migration completion requires explicit interactive approval and is not performed autonomously.

Still pending remotely:
- `0002_social_content_location.sql`
- `0003_social_content_grants.sql`
- `0004_kmap_owner_revoke_policy.sql`
- hardened `0005_group_single_owner.sql` + `0006_group_moderation.sql` + defense-in-depth `0007_group_bans_server_only.sql`

## Server runtime
Implemented on green or current-CI heads:
- Neon Auth JWT/JWKS Socket.IO authentication; identity derives only from verified JWT `sub`.
- PostgreSQL server access with parameterized SQL/transactions; no Supabase database dependency.
- contact request/accept/decline/cancel/remove/block lifecycle.
- presence, login alerts, K-Pulse/Wizz, direct conversations, encrypted-envelope history, delivered/read receipts.
- group create/invite/remove/role/leave/ownership transfer plus mute/ban/unban and moderator-only ban list.
- group mute enforced before message persistence and active-ban reinvite blocked.
- read-receipt privacy enforced server-side.
- ban registry direct Data API exposure removed from pending migration path.

## Mobile runtime
Implemented on green or current-CI heads:
- real Neon Auth email/password login/session.
- username/display name/avatar/status/bio/current music profile.
- contacts lifecycle UI, presence, favorites, block/unblock, K-Pulse.
- direct/group encrypted-envelope history and receipt UX.
- group member roles and moderation UI including ban list/unban.
- reconnect obtains a fresh Neon Auth token.
- account export through authenticated Data API/RLS.
- K-Feed uses Neon/RLS-visible metadata and reporting; demo rows removed.
- Moments uses real 24h Neon rows for text moments, visibility/delete/report; demo rows removed.
- K-MAP uses authorized share rows, recipient-safe coordinates, revoke and Ghost Mode; static preview removed.

## Product V1 gates still required before claiming premium V1
1. Explicit application and verification of pending K-ssenger Neon migrations on main.
2. Real two-account/two-device remote flow covering auth -> contacts -> presence/login alert -> K-Pulse -> direct/group -> receipts -> moderation/ownership -> forced reconnect/token refresh.
3. Vetted native E2EE/device-key protocol with device proof before enabling private/group plaintext composition.
4. Approved native media storage/upload + in-app video playback for K-Feed and photo/video Moments.
5. Native GPS permission/capture for creating K-MAP shares.
6. Push notification/token lifecycle.
7. Secure self-service Neon Auth account deletion through a server-side path; never expose Neon management credentials to mobile.
8. Premium MSN-inspired independent polish plus verified installable Android build and signed Android/iOS release builds when signing credentials/tooling are available.

## Safety rules
- K-ssenger resources only.
- Never expose secrets.
- Never force-push.
- Never weaken authorization to make tests pass.
- Never reuse another project's backend/database/deployment.
- Never invent custom cryptography or claim production E2EE without a vetted native protocol and device proof.
- Keep PR #2 Draft while critical validation remains incomplete.
