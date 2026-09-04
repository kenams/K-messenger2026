# PROJECT STATE

## Repository
- Repository: `kenams/K-messenger2026`
- Active branch: `fix/feed-kmap-contact-security`
- Base: `bootstrap/platform`
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT, mergeable.
- Keep PR #2 draft until database, security, multi-device, media/push and release gates are proven.

## Latest verified GitHub state
Verified 2026-09-04:
- Head `40b987e167b796a294d2369254a7b05ea9090bfe` passed CI run #256: triaged dependency audit, TypeScript, server tests, core RLS integration and social/K-MAP RLS integration all succeeded.
- Account export TypeScript failures from runs #241/#242 were fixed by `ec00b8a595d1986537b31054d37c65efe2bd4698`; later CI is green.
- Production EAS configuration points only at the dedicated public K-ssenger Neon Auth/Data API and K-ssenger realtime endpoints (`43a277ad977d65f8518dd45915e8481d0984ec3e`). No secret credential is embedded.
- CI, remote smoke and Android workflows use `npm ci` against the committed lockfile.
- Mobile Neon configuration fails closed unless both public Neon URLs exactly match the dedicated K-ssenger backend (`9cfcd603f1bcad86b49bdffd888123a96127680a`).
- Auth UI catches offline/backend login and signup failures without leaking provider details (`6d07868e60380ec7991ed37ed7796cddbd798be0`).
- Dependency audit is now a strict triage gate: known Expo/Metro build-tool advisories are allowlisted by exact GHSA id; any new high/critical advisory fails CI (`565e39db5a5d15fd200bb3010f30db022f3a7424`, `40b987e167b796a294d2369254a7b05ea9090bfe`). No `npm audit fix --force` or breaking Expo jump was used.
- Remote Social Smoke run #20 passed against the real K-ssenger Neon/Auth/Data API/realtime backend. The workflow is now scoped to backend/migration/smoke changes so mobile/docs commits no longer create unnecessary temporary Auth users (`459fa19ef0117d46cdcf7a51d670ccc57db6445a`).
- Android debug run #52 produced and uploaded an APK, but it was not accepted as a V1 artifact because the old workflow did not inject the public backend endpoints and debug builds can depend on Metro.
- `f7d2c4fdaf70b4074f11abd9b34bc5521380d2e8` replaces that workflow with a standalone internal `assembleRelease` APK build, embeds only the three public K-ssenger endpoints, validates them before build, and uses no distribution secret. Run #53 is compiling; it is not considered verified until artifact upload succeeds.
- No force-push was used.

## Agent-Kah branch review
- `import/mobile-agent-kah` and `import/server-agent-kah` remain historical import sources only.
- Do not merge the old server implementation wholesale: Supabase persistence assumptions and placeholder handshake auth have been replaced by Neon/Postgres plus verified Neon Auth JWT identity.

## Dedicated Neon backend
Only project `K-ssenger` (`late-flower-65059830`) / database `kssenger` is allowed.

Re-verified 2026-09-04:
- default branch `main`: `br-falling-sea-b1k36u32`, READY.
- Neon Auth on main is Neon-managed Better Auth; email/password signup/sign-in is enabled.
- public K-ssenger tables include core messaging plus `public_videos`, `video_reports`, `moments`, `moment_views`, `moment_reactions`, `moment_reports`, `location_shares`, `location_points`, `group_bans` and `user_age_profile`.
- every inspected public table has RLS enabled.
- single-owner group index is present.
- `conversation_members.muted_until` is present.
- authenticated Data API SELECT privilege on `group_bans` is revoked.
- K-Feed, Moments and K-MAP policy sets are present on main.
- K-MAP exact coordinates remain owner-only; recipients use the server-side viewer function which coarsens approximate shares before returning them.
- Neon branchable Object Storage is enabled on main. Private bucket `kssenger-media` was created on the K-ssenger main branch on 2026-09-04. It is not public and is not yet counted as completed media support until authenticated presigned upload/download is integrated and tested.
- temporary smoke account cleanup was attempted only for exact generated `kssenger-social-*` / `kssenger-v1-*` `@example.com` users. One generated account was removed successfully; Neon rejected the next deletion without a usable error, so no SQL/admin bypass was used and normal users were not touched.
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
- age safety gate persists an explicit birth date to the authenticated user's `user_age_profile` under RLS, reloads it after reconnect/app restart, and fails closed when the server profile cannot be stored/verified (`4f5fa2fe8df870620f03540eb8f2edf44625ba06`).
- K-Feed uses Neon/RLS-visible metadata and reporting; demo rows removed.
- Moments uses real 24h Neon rows for text moments, visibility/delete/report; demo rows removed.
- K-MAP uses authorized share rows, recipient-safe coordinates, revoke and Ghost Mode; static preview removed.
- preview and production EAS profiles both target the dedicated K-ssenger public backend endpoints.

## Product V1 gates still required before claiming premium V1
1. Real two-account/two-device flow covering auth -> contacts -> presence/login alert -> K-Pulse -> direct/group -> receipts -> moderation/ownership -> forced reconnect/token refresh. Remote Social Smoke is green but does not replace physical two-device validation.
2. Vetted native E2EE/device-key protocol with device proof before enabling private/group plaintext composition. Opaque ciphertext-envelope transport is not claimed as production E2EE.
3. Authenticated media upload/download + in-app photo/video selection/playback. Private Neon storage now exists; client credentials must never be exposed. Neon Functions/Object Storage are currently beta, so the presign path must be proven before release.
4. Native GPS foreground permission/capture for creating K-MAP shares; the existing server privacy model is ready but mobile capture is intentionally locked until the native dependency/device test is in place.
5. Push notification/token lifecycle.
6. Secure self-service Neon Auth account deletion. Managed Auth is Better Auth, whose delete-user facility is disabled by default and should require password/fresh-session verification; the current managed Neon configuration surface has not exposed/proven that switch, so no admin credential workaround is allowed.
7. Premium MSN-inspired independent polish and verification of standalone Android run #53; signed Android/iOS production builds still require distribution signing credentials/tooling.

## Safety rules
- K-ssenger resources only.
- Never expose secrets.
- Never force-push.
- Never weaken authorization to make tests pass.
- Never reuse another project's backend/database/deployment.
- Never invent custom cryptography or claim production E2EE without a vetted native protocol and device proof.
- Keep PR #2 Draft while critical validation remains incomplete.
