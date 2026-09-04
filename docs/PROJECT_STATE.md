# PROJECT STATE

## Repository
- Repository: `kenams/K-messenger2026`
- Active branch: `fix/feed-kmap-contact-security`
- Base: `bootstrap/platform`
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT, mergeable.
- Keep PR #2 draft until database, security, multi-device, media/push and release gates are proven.

## Latest verified GitHub state
Verified 2026-09-04:
- PR #2 head after this run: `4268a8702b20f43edc6a6f4ca9148528927b1281` (`feat(account): complete privacy-safe Neon data export`).
- Previous head `cb5e8c1b9ce0dd2e4c2f1e0f492ccd3e14536719` passed GitHub Actions CI run #239.
- New head CI had not started when last checked; do not treat it as release-validated until CI is green.
- No force-push was used.
- Account export v2 now excludes other users' public profile-directory rows and includes the authenticated user's Neon/RLS-authorized K-Feed, Moments and owned K-MAP data. Server-side encrypted message envelopes remain encrypted in the export.

## Agent-Kah branch review
- `import/mobile-agent-kah` and `import/server-agent-kah` remain historical import sources only.
- Do not merge the old server implementation wholesale: Supabase persistence assumptions and placeholder handshake auth have been replaced by Neon/Postgres plus verified Neon Auth JWT identity.

## Dedicated Neon backend
Only project `K-ssenger` (`late-flower-65059830`) / database `kssenger` is allowed.

Re-verified 2026-09-04:
- default branch `main`: `br-falling-sea-b1k36u32`, READY.
- public K-ssenger tables currently present on main include core messaging plus `public_videos`, `video_reports`, `moments`, `moment_views`, `moment_reactions`, `moment_reports`, `location_shares`, `location_points`, `group_bans` and `user_age_profile`.
- every inspected public table has RLS enabled.
- single-owner group index is present.
- `conversation_members.muted_until` is present.
- authenticated Data API SELECT privilege on `group_bans` is revoked.
- K-Feed, Moments and K-MAP policy sets are present on main.
- no schema write was performed against Neon main in this run.
- no other Neon project was touched.

### Neon branch hygiene
Existing non-default K-ssenger test/migration branches observed this run:
- `v1-social-interaction-rls-test` (`br-spring-firefly-b11ajgzc`)
- `v1-social-functions-test` (`br-twilight-morning-b1nv3vgc`)
- older migration branch `br-gentle-union-b1dttksj`

Do not delete or promote migration/test branches autonomously. Neon destructive cleanup and prepared migration completion require explicit interactive approval.

## Server runtime
Implemented on green or current-CI heads:
- Neon Auth JWT/JWKS Socket.IO authentication; identity derives only from verified JWT `sub`.
- PostgreSQL server access with parameterized SQL/transactions; no Supabase database dependency.
- contact request/accept/decline/cancel/remove/block lifecycle.
- presence, login alerts, K-Pulse/Wizz, direct conversations, encrypted-envelope history, delivered/read receipts.
- group create/invite/remove/role/leave/ownership transfer plus mute/ban/unban and moderator-only ban list.
- group mute enforced before message persistence and active-ban reinvite blocked.
- read-receipt privacy enforced server-side.
- ban registry direct Data API exposure removed.

## Mobile runtime
Implemented on green or current-CI heads:
- real Neon Auth email/password login/session.
- username/display name/avatar/status/bio/current music profile.
- contacts lifecycle UI, presence, favorites, block/unblock, K-Pulse.
- direct/group encrypted-envelope history and receipt UX.
- group member roles and moderation UI including ban list/unban.
- reconnect obtains a fresh Neon Auth token.
- privacy-safe account export v2 through authenticated Neon Data API/RLS.
- K-Feed uses Neon/RLS-visible metadata and reporting; demo rows removed.
- Moments uses real 24h Neon rows for text moments, visibility/delete/report; demo rows removed.
- K-MAP uses authorized share rows, recipient-safe coordinates, revoke and Ghost Mode; static preview removed.

## Product V1 gates still required before claiming premium V1
1. New PR head must pass CI and remote integration validation.
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
