# PROJECT STATE

## Repository
- Repository: `kenams/K-messenger2026`
- Active branch: `fix/feed-kmap-contact-security`
- Base: `bootstrap/platform`
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT, mergeable at last verification.
- Keep PR #2 draft until critical database, security, multi-device, media/push and release gates are proven.

## Latest verified GitHub state
Verified 2026-09-04:
- CI #219 on `6f84d17b19eb230bc719d1ce7864a9651def9bb8`: SUCCESS.
- Earlier green validation includes group moderation UI, K-MAP runtime/navigation and server-side read-receipt privacy enforcement.
- `b889be25272dbd811cd00eac76b5971ab27fdbb7` exposes the full existing contact lifecycle in mobile: decline incoming requests, cancel outgoing requests, remove contacts and block contacts. Its unit/typecheck job is green; RLS integration and Android APK were still running at the latest check.
- `2ee270e3a44bf7fafac5749207efee4da0fe9d6f` adds self-scoped blocked-user management under Privacy using the existing `blocks_owner_all` Neon RLS policy. Its CI/APK checks were still running at the latest check.
- No force-push was used.

Recent functional commits:
- `d07bd13d0cd5697c3a748d99525a442f2ec4dd52` — real group mute/unmute/ban/unban UI plus moderator ban list.
- `92adeb78eeb06ec12b9a33cb10cb5771d87ddff6` — real RLS-backed 24-hour text Moments, delete and report flows.
- `e9991f61b95cea12c47286aaa83a49fc5f4bd971` — real RLS/age/moderation-filtered K-Feed metadata and reporting.
- `646bf8ee38ddebfca664e44a399fa60a2aad5f56` — real K-MAP active/received share privacy view, safe recipient coordinates, revoke and Ghost Mode.
- `e68bdf331cf00a45b7334df2bfd99c1b4d43b66c` — K-MAP wired into actual app navigation.
- `5f7fd8ba64d4d7c6d9dd90a34a97a64f98e50a00` — server persistence downgrades read receipts when user privacy disables them.
- `b889be25272dbd811cd00eac76b5971ab27fdbb7` — full contact request/removal/block UI.
- `2ee270e3a44bf7fafac5749207efee4da0fe9d6f` — blocked-user listing and self-service unblock under RLS.

## Agent-Kah branch review
Re-verified 2026-09-04:
- `import/mobile-agent-kah` head is `d97152456f7bf668a13f29d19d2c742538c5cafa` from 2026-09-02.
- `import/server-agent-kah` head is `ac25216a2f572e53973b14c12b75a34ec2441732` from 2026-09-02.
- Neither branch contains a newer change than the active V1 branch.
- Do not merge the old server branch wholesale: it used Supabase-backed persistence assumptions and placeholder handshake auth that have since been replaced by Neon/Postgres + verified Neon Auth JWT identity.

## Dedicated Neon backend
Only project `K-ssenger` (`late-flower-65059830`) is allowed.

Re-verified 2026-09-04:
- PostgreSQL 17
- region `aws-eu-central-1`
- plan `free_v3`
- Neon Auth provider is managed Better Auth on the dedicated K-ssenger branch; email/password sign-up is enabled.
- dedicated K-ssenger project only; no other Neon project was touched.
- Core `blocks` RLS already permits only the authenticated blocker to read/write/delete its own block rows; mobile unblock uses this existing boundary and does not require a privileged backend shortcut.

### Prepared moderation migration
Migration `0005 + 0006` was prepared and tested only on temporary branch `br-gentle-union-b1dttksj`, parent `br-falling-sea-b1k36u32`.
Verified on the temporary branch:
- partial unique single-owner index exists
- `conversation_members.muted_until` exists
- `group_bans` exists
- `group_bans` RLS is enabled
- `group_bans_member_read` policy exists

This migration is NOT applied to main. Promotion or cleanup through the Neon migration completion action requires explicit interactive approval and therefore is not performed by autonomous runs.

Still pending remotely:
- `0002_social_content_location.sql`
- `0003_social_content_grants.sql`
- `0004_kmap_owner_revoke_policy.sql`
- tested `0005_group_single_owner.sql`
- tested `0006_group_moderation.sql`

## Server runtime
Implemented/validated on green heads:
- Neon Auth JWT/JWKS Socket.IO authentication; identity derives only from verified JWT `sub`.
- PostgreSQL access through `pg`, parameterized SQL and transactions; no server Supabase database dependency.
- full contact lifecycle backend: request/accept/decline/cancel/remove/block.
- presence, K-Pulse, direct conversations, encrypted-envelope history, delivered/read receipts and group lifecycle.
- group invite/remove/promote/demote/leave/ownership-transfer authorization.
- mute/ban/unban store primitives with owner/admin role checks, no self-moderation and owner/admin protection boundaries.
- active-ban reinvite protection and group mute enforcement before message persistence.
- moderator-only bounded `group:bans-list`.
- receipt persistence honors `privacy_settings.read_receipts` server-side for direct and group chats.

## Mobile runtime
Implemented/validated or under latest CI:
- real Neon Auth email/password login and session handling.
- username/display name/avatar/status/bio/current music profile.
- complete contacts lifecycle UI including decline/cancel/remove/block, presence/login alerts, favorites and K-Pulse.
- privacy screen now lists the authenticated user's own block rows and permits RLS-scoped unblock; unblock never restores a contact automatically.
- direct/group encrypted-envelope history and receipt UX.
- group creation/open/list/member roles + moderation controls.
- reconnect obtains a fresh Neon Auth token.
- account export through authenticated Data API/RLS.

Social V1 progress:
- Moments contains no demo rows. Text Moments are real Neon rows with 24h expiry, visibility, delete and report behavior. Native photo/video media creation stays locked until approved storage/upload exists.
- K-Feed contains no demo rows. It loads only Data API/RLS-visible video metadata and exposes reporting. Native in-app playback/upload still requires approved media storage/player integration.
- K-MAP no longer uses a static preview. It lists authorized active/received shares, reads recipient-safe coordinates through `location_point_for_viewer`, revokes shares and implements Ghost Mode. Creating a new share remains locked until native GPS permission/capture is integrated and device-tested.

## Product V1 gates still required before claiming premium V1
1. Explicit application and verification of pending K-ssenger Neon migrations on main.
2. Real two-account/two-device remote flow: signup/login -> contacts -> presence/login alerts -> K-Pulse -> direct/group -> receipts -> membership/moderation -> ownership transfer -> forced reconnect/token refresh.
3. Vetted native E2EE/device-key protocol with device proof before enabling private/group plaintext composition.
4. Approved native media storage/upload + in-app video playback for K-Feed and media Moments.
5. Native GPS capture/permission for creating K-MAP shares.
6. Push notifications and token lifecycle.
7. Secure self-service Neon Auth account deletion. Neon exposes a branch-scoped management delete API, but a mobile client must never receive a Neon management API token; deletion needs a secured server-side path plus recent-session/password verification before activation.
8. Premium release polish and verified installable Android build; signed Android/iOS builds when signing credentials/tooling are available.

## Safety rules
- K-ssenger resources only.
- Never expose secrets.
- Never force-push.
- Never weaken authorization to make tests pass.
- Never reuse another project's backend/database/deployment.
- Never invent custom cryptography or claim production E2EE without a vetted native protocol and device proof.
- Keep PR #2 Draft while critical validation remains incomplete.
