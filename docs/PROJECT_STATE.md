# PROJECT STATE

## Repository
- Repository: `kenams/K-messenger2026`
- Active branch: `fix/feed-kmap-contact-security`
- Base: `bootstrap/platform`
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT, mergeable.
- Keep PR #2 draft until database, security, multi-device, media/push and release gates are proven.

## Latest verified GitHub state
Verified 2026-09-04:
- Functional head `4f5fa2fe8df870620f03540eb8f2edf44625ba06` (`fix(safety): persist age gate through Neon RLS profile`) passed GitHub Actions CI run #248, including typecheck/server tests and both PostgreSQL RLS integration suites.
- Earlier CI failures #241/#242 were isolated to mobile account-export TypeScript typing and were fixed by `ec00b8a595d1986537b31054d37c65efe2bd4698`; CI #243 passed.
- Production EAS configuration now points at the dedicated public K-ssenger Neon Auth/Data API and K-ssenger realtime endpoints (`43a277ad977d65f8518dd45915e8481d0984ec3e`). No secret credential is embedded in this configuration.
- CI and Android APK workflows now use `npm ci` against the committed lockfile for deterministic dependency resolution (`c4dbd8f409b653480f3ed9f678207af390c06fcb`, `1ad0858ddfe3be3144ed29750884cb2ec80c7365`).
- Mobile Neon configuration now fails closed unless both public Neon URLs exactly match the dedicated K-ssenger backend (`9cfcd603f1bcad86b49bdffd888123a96127680a`).
- Android Debug APK run #51 for functional head `4f5fa2fe...` was still building when last checked; installable artifact is not considered verified until the workflow uploads it successfully.
- npm currently reports 16 dependency advisories during CI install (7 moderate, 9 high). These must be triaged without `--force` or unsafe breaking upgrades before release sign-off.
- No force-push was used.

## Agent-Kah branch review
- `import/mobile-agent-kah` and `import/server-agent-kah` remain historical import sources only.
- Do not merge the old server implementation wholesale: Supabase persistence assumptions and placeholder handshake auth have been replaced by Neon/Postgres plus verified Neon Auth JWT identity.

## Dedicated Neon backend
Only project `K-ssenger` (`late-flower-65059830`) / database `kssenger` is allowed.

Re-verified 2026-09-04:
- default branch `main`: `br-falling-sea-b1k36u32`, READY.
- Neon Auth on main is Neon-managed Better Auth; email/password signup/sign-in is enabled.
- public K-ssenger tables currently present on main include core messaging plus `public_videos`, `video_reports`, `moments`, `moment_views`, `moment_reactions`, `moment_reports`, `location_shares`, `location_points`, `group_bans` and `user_age_profile`.
- every inspected public table has RLS enabled.
- single-owner group index is present.
- `conversation_members.muted_until` is present.
- authenticated Data API SELECT privilege on `group_bans` is revoked.
- K-Feed, Moments and K-MAP policy sets are present on main.
- K-MAP exact coordinates remain owner-only; recipients use the server-side viewer function which coarsens approximate shares before returning them.
- no schema write was performed against Neon main in this run.
- no other Neon project was touched.

### Neon branch hygiene
Existing non-default K-ssenger test/migration branches observed this run:
- `v1-social-interaction-rls-test` (`br-spring-firefly-b11ajgzc`)
- `v1-social-functions-test` (`br-twilight-morning-b1nv3vgc`)
- older migration branch `br-gentle-union-b1dttksj`

Do not delete or promote migration/test branches autonomously. Neon destructive cleanup and prepared migration completion require explicit interactive approval.

## Server runtime
Implemented on green heads:
- Neon Auth JWT/JWKS Socket.IO authentication; identity derives only from verified JWT `sub`.
- PostgreSQL server access with parameterized SQL/transactions; no Supabase database dependency.
- contact request/accept/decline/cancel/remove/block lifecycle.
- presence, login alerts, K-Pulse/Wizz, direct conversations, encrypted-envelope history, delivered/read receipts.
- group create/invite/remove/role/leave/ownership transfer plus mute/ban/unban and moderator-only ban list.
- group mute enforced before message persistence and active-ban reinvite blocked.
- read-receipt privacy enforced server-side.
- ban registry direct Data API exposure removed.

## Mobile runtime
Implemented on green heads:
- real Neon Auth email/password login/session.
- username/display name/avatar/status/bio/current music profile.
- contacts lifecycle UI, presence, favorites, block/unblock, K-Pulse.
- direct/group encrypted-envelope history and receipt UX.
- group member roles and moderation UI including ban list/unban.
- reconnect obtains a fresh Neon Auth token.
- privacy-safe account export v2 through authenticated Neon Data API/RLS; public directory rows belonging to other users are excluded and message envelopes remain encrypted.
- age safety gate now persists an explicit birth date to the authenticated user's `user_age_profile` under RLS, reloads it after reconnect/app restart, and fails closed when the server profile cannot be stored/verified.
- K-Feed uses Neon/RLS-visible metadata and reporting; demo rows removed.
- Moments uses real 24h Neon rows for text moments, visibility/delete/report; demo rows removed.
- K-MAP uses authorized share rows, recipient-safe coordinates, revoke and Ghost Mode; static preview removed.
- preview and production EAS profiles both target the dedicated K-ssenger public backend endpoints.

## Product V1 gates still required before claiming premium V1
1. Remote integration validation on the current release candidate, including public realtime health. CI #248 is green but does not replace the remote smoke suite.
2. Real two-account/two-device flow covering auth -> contacts -> presence/login alert -> K-Pulse -> direct/group -> receipts -> moderation/ownership -> forced reconnect/token refresh.
3. Vetted native E2EE/device-key protocol with device proof before enabling private/group plaintext composition. Opaque ciphertext-envelope transport is not claimed as production E2EE.
4. Approved native media storage/upload + in-app video playback for K-Feed and photo/video Moments.
5. Native GPS foreground permission/capture for creating K-MAP shares; the existing server privacy model is ready but mobile capture is intentionally locked until the native dependency/device test is in place.
6. Push notification/token lifecycle.
7. Secure self-service Neon Auth account deletion. Neon Auth is confirmed to be Better Auth, but managed self-delete enablement has not yet been proven; do not expose management/admin credentials to mobile as a workaround.
8. Dependency advisory triage for current 7 moderate / 9 high npm findings without weakening tests or forcing breaking upgrades.
9. Premium MSN-inspired independent polish plus verified installable Android artifact and signed Android/iOS release builds when signing credentials/tooling are available.

## Safety rules
- K-ssenger resources only.
- Never expose secrets.
- Never force-push.
- Never weaken authorization to make tests pass.
- Never reuse another project's backend/database/deployment.
- Never invent custom cryptography or claim production E2EE without a vetted native protocol and device proof.
- Keep PR #2 Draft while critical validation remains incomplete.
