# PROJECT STATE

## Repository
- Repository: `kenams/K-messenger2026`
- Active branch: `fix/feed-kmap-contact-security`
- Base: `bootstrap/platform`
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT, mergeable at last verification
- Keep PR #2 draft until critical database, security, multi-device, media/push and release gates are proven.

## Latest verified GitHub state
Verified 2026-09-04:
- CI #206 on `8531a1117aab5fed5414be94e25e62c5787c04a8`: FAILURE only in `test:server`; typecheck and both RLS integration jobs remained green.
- Root cause was isolated: `group-moderation-socket.test.ts` imported the database-backed moderation store transitively, so module initialization parsed production-only `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` and `CORS_ORIGIN` before the contract tests ran.
- Functional fix `e63bb70b6847322082982f4807b98596f1e3b561` makes the database-backed ban-list store load lazily only after rate-limit and strict request validation. Runtime authorization is unchanged; production still reaches transaction-authorized `listGroupBans()`.
- Regression commit `0a2aefe1d938895ab0f2a609349425490f307458` adds an injected-store success-path proof that only the authenticated socket user id and validated conversation UUID reach the store, while forged actor data and malformed IDs never do.
- CI #208 on `0a2aefe1d938895ab0f2a609349425490f307458` is queued and is not yet release-validated.
- No force-push was used.

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
Implemented/validated on prior green heads:
- Neon Auth JWT/JWKS Socket.IO authentication; identity derives only from verified JWT `sub`.
- PostgreSQL access through `pg`, parameterized SQL and transactions; no server `@supabase/supabase-js` dependency.
- contacts lifecycle, presence, K-Pulse, direct conversations, encrypted-envelope history, delivered/read receipts and group lifecycle.
- group invite/remove/promote/demote/leave/ownership-transfer authorization.
- migration-backed single-owner rule.
- mute/ban/unban store primitives with owner/admin role checks, no self-moderation and owner/admin protection boundaries.
- active-ban reinvite protection and group mute enforcement before message persistence.
- `listGroupBans()` is bounded to 200 rows, profile-shaped and transaction-authorized for owner/admin only; `bannedAt` is an ISO string.
- `group:mute`, `group:ban` and `group:unban` handlers are registered.

Current functional addition:
- `groupModerationSocket.ts` defines `registerGroupBanListHandler()` for `group:bans-list`.
- The handler uses only the authenticated socket `userId`, parses the strict UUID-only `groupConversationSchema`, rate-limits through an injected limiter callback, then calls transaction-protected `listGroupBans()`.
- The production store is now lazy-loaded only after rate-limit and schema validation, preventing contract-test secret coupling without bypassing any runtime authorization.
- Forged actor/role fields remain rejected by the strict request schema; rejected/malformed requests fail closed.
- Regression tests now cover rate-limit short-circuit, forged actor rejection, malformed conversation UUID rejection, and authenticated identity propagation on the valid path.
- `server.ts` still needs to call this registration helper before `group:bans-list` becomes available at runtime.

## Mobile runtime
Implemented/validated on prior green heads:
- explicit Neon Auth/Data API client and authenticated Socket.IO endpoint.
- reconnect obtains a fresh Neon Auth token.
- profile username/display name/avatar/status/bio/current music and privacy controls.
- contacts lifecycle, dynamic presence/login alerts, K-Pulse.
- direct/group encrypted-envelope history and receipt UX.
- group creation/open/list/member role actions.
- moderation helpers and `groupModerationRealtime.ts` for fail-closed mute/unmute/ban/unban requests plus typed future `group:bans-list` consumption.
- centralized normalization/subscription for `group:moderation` and `group:banned` events.

Still pending:
- wire moderator controls into `GroupsScreen`.
- expose and consume `group:bans-list` end-to-end for unban UX.
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
