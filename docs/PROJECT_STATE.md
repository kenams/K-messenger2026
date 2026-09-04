# PROJECT STATE

## Repository
- Repository: `kenams/K-messenger2026`
- Active branch: `fix/feed-kmap-contact-security`
- Base: `bootstrap/platform`
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT, mergeable at last verification
- Keep PR #2 draft until critical database, security, multi-device, media/push and release gates are proven.

## Latest verified GitHub state
Verified 2026-09-04:
- CI #211 on `bd32d3388b96da3c3e394239262782b7b0570321`: SUCCESS.
- This validates the production registration of `group:bans-list` in the authenticated Socket.IO runtime.
- Functional commit `d07bd13d0cd5697c3a748d99525a442f2ec4dd52` wires moderation into `GroupsScreen`.
- Group owners/admins now get role-aware mute 1h, unmute and ban controls; the target capability calculation is shared with the server-aligned mobile moderation helper.
- `GroupsScreen` consumes the moderator-only `group:bans-list`, displays the bounded typed ban list and exposes unban.
- The screen subscribes to normalized `group:moderation` / `group:banned` events and exits a banned user from the active group view fail-closed.
- The newest mobile moderation UI commit is awaiting its own CI before it is considered release-validated.
- No force-push was used.

## Agent-Kah branch review
Re-verified 2026-09-04:
- `import/mobile-agent-kah` head is `d97152456f7bf668a13f29d19d2c742538c5cafa` from 2026-09-02.
- `import/server-agent-kah` head is `ac25216a2f572e53973b14c12b75a34ec2441732` from 2026-09-02.
- Neither branch contains a newer change than the active V1 branch.
- Do not merge the old server branch wholesale: it explicitly used Supabase-backed persistence assumptions and placeholder handshake auth that have since been replaced by Neon/Postgres + verified Neon Auth JWT identity.

## Dedicated Neon backend
Only project `K-ssenger` (`late-flower-65059830`) is allowed.

Re-verified 2026-09-04:
- PostgreSQL 17
- region `aws-eu-central-1`
- plan `free_v3`
- dedicated K-ssenger project only; no other Neon project was touched
- remote schema was not changed during this run

Pending remote migrations remain guarded by explicit approval. Do not autonomously apply them:
- `0002_social_content_location.sql`
- `0003_social_content_grants.sql`
- `0004_kmap_owner_revoke_policy.sql`
- `0005_group_single_owner.sql`
- `0006_group_moderation.sql`

Do not deploy moderation runtime that depends on `conversation_members.muted_until` / `group_bans` before migration `0006_group_moderation.sql` is approved, applied and verified on the dedicated Neon branch.

## Server runtime
Implemented/validated on green heads:
- Neon Auth JWT/JWKS Socket.IO authentication; identity derives only from verified JWT `sub`.
- PostgreSQL access through `pg`, parameterized SQL and transactions; no server `@supabase/supabase-js` dependency.
- contacts lifecycle, presence, K-Pulse, direct conversations, encrypted-envelope history, delivered/read receipts and group lifecycle.
- group invite/remove/promote/demote/leave/ownership-transfer authorization.
- migration-backed single-owner rule.
- mute/ban/unban store primitives with owner/admin role checks, no self-moderation and owner/admin protection boundaries.
- active-ban reinvite protection and group mute enforcement before message persistence.
- `listGroupBans()` is bounded to 200 rows, profile-shaped and transaction-authorized for owner/admin only; `bannedAt` is an ISO string.
- `group:mute`, `group:ban`, `group:unban` and `group:bans-list` handlers are registered.
- `group:bans-list` identity comes only from `socket.data.userId`, client actor/role fields are rejected, and the store performs a fresh transactional owner/admin authorization check.

## Mobile runtime
Implemented/validated on prior green heads:
- explicit Neon Auth/Data API client and authenticated Socket.IO endpoint.
- reconnect obtains a fresh Neon Auth token.
- profile username/display name/avatar/status/bio/current music and privacy controls.
- contacts lifecycle, dynamic presence/login alerts, K-Pulse.
- direct/group encrypted-envelope history and receipt UX.
- group creation/open/list/member role actions.
- moderation helpers and `groupModerationRealtime.ts` for fail-closed mute/unmute/ban/unban requests and typed `group:bans-list` consumption.
- centralized normalization/subscription for `group:moderation` and `group:banned` events.

Current functional addition awaiting CI:
- `GroupsScreen` now exposes mute 1 h, unmute, ban and unban only when `getGroupModerationCapabilities()` permits the action.
- owner/admin users can load and refresh the server-authorized ban list.
- a ban event removes the affected user from the active group view instead of leaving stale privileged UI visible.
- moderation failures remain fail-closed and rate-limit failures are surfaced distinctly.

Still pending:
- group read-receipt privacy parity.
- real plaintext sending stays disabled until a vetted native E2EE/device-key protocol is integrated and proven on devices.

## Product V1 gates
Required before calling K-ssenger an operational premium V1:
1. Real two-account/two-device remote flow: signup/login -> contacts -> presence/login alerts -> K-Pulse -> direct/group -> receipts -> membership/moderation -> ownership transfer -> forced reconnect/token refresh.
2. Vetted native E2EE/device-key protocol with device proof before enabling private/group plaintext composition.
3. Explicitly approved and verified Neon migrations for K-Feed, Moments, K-MAP and moderation.
4. Real K-Feed vertical video runtime, Moments/ephemeral runtime and K-MAP privacy-aware runtime.
5. Approved native media storage/upload and push notifications; never store large media blobs in Postgres.
6. Complete moderation/report/block UX, secure account deletion and export verification.
7. Premium release polish preserving independent MSN-era nostalgic identity without Microsoft assets/branding.
8. Verified installable Android build and signed Android/iOS release builds when signing/tooling is available.

## Safety rules
- K-ssenger resources only.
- Never expose secrets.
- Never force-push.
- Never weaken authorization to make tests pass.
- Never reuse another project's backend/database/deployment.
- Never invent custom cryptography or claim production E2EE without a vetted native protocol and device proof.
- Keep PR #2 Draft while critical validation remains incomplete.
