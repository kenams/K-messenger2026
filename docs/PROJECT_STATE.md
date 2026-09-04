# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active Integration
- `main` - documentation baseline only
- `bootstrap/platform` - implementation base
- `fix/feed-kmap-contact-security` - active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` - OPEN, DRAFT, mergeable
- keep PR #2 draft until the critical remote multi-user flow, E2EE/device path, media/push and release gates are proven

## Latest Verified GitHub State
Verified on 2026-09-04:
- CI #198 on head `5b8322f4a30b41050143d794017fb25de4fa2ff1`: SUCCESS
- workspace/typecheck: SUCCESS
- server tests: SUCCESS
- core Alice/Bob/Charlie RLS integration suite: SUCCESS
- K-Feed/Moments/K-MAP isolated PostgreSQL 17 RLS suite: SUCCESS
- DB-level single-owner enforcement is CI-validated in fresh core installs plus incremental migration `0005_group_single_owner.sql`
- migration `0006_group_moderation.sql`, guarded backend mute/ban primitives, strict moderation payload validation, active-ban reinvite protection, persistence-level group mute enforcement, persistence-level receipt membership checks, authenticated Socket.IO moderation handlers, bounded moderator-only group-ban listing primitive and strict group-scoped moderation read payload coverage are CI-validated through #198
- mobile has a guarded realtime moderation client for mute/unmute/ban/unban plus the future moderator-only ban-list event; malformed or rejected acknowledgements fail closed instead of being treated as success
- current functional head includes commit `71e30fe2fdffd2a06739897df73f23399b7b1dd4`, which normalizes persisted mute expiry to an ISO string before realtime acknowledgement/event serialization; CI for this head must pass before release validation
- earlier Android APK builds are verified successful, including APK #25 wired to the public Render + Neon configuration

## Dedicated Remote K-ssenger Backend
Only the dedicated free Neon project `K-ssenger` (`late-flower-65059830`) may be used.

Re-verified through the connected Neon project on 2026-09-04:
- PostgreSQL 17
- region `aws-eu-central-1`
- dedicated free project (`free_v3`)
- database `kssenger`
- no other Neon project was touched during this run
- remote public schema remains intentionally unchanged by this run
- message persistence remains ciphertext-envelope only and idempotent by `(sender_user_id, client_message_id)`

Important remote migration status:
- `neon/migrations/0002_social_content_location.sql`
- `neon/migrations/0003_social_content_grants.sql`
- `neon/migrations/0004_kmap_owner_revoke_policy.sql`
- `neon/migrations/0005_group_single_owner.sql`
- `neon/migrations/0006_group_moderation.sql`
are committed for the dedicated Neon design. 0002-0004 remain isolated-CI validated and not remotely applied; 0005-0006 are CI-validated in repository CI. None of these incremental migrations may be applied to the remote branch without the explicit migration-approval flow.
- applying remote schema changes requires an explicit migration approval step; never bypass that safeguard
- because runtime mute enforcement reads `conversation_members.muted_until`, do not deploy this functional head to the remote runtime before `0006_group_moderation.sql` is approved/applied and verified there

## Server Runtime
Completed and CI-validated unless explicitly marked pending on the current head:
- Socket.IO access token authentication uses Neon Auth JWT/JWKS validation through `jose`
- identity is derived from verified JWT `sub`; client-supplied identity is never trusted
- server runtime has no `@supabase/supabase-js` dependency
- PostgreSQL access uses `pg`, parameterized SQL and explicit transactions
- contacts request/accept/decline/cancel/remove/favorite/block paths are Neon/Postgres-backed
- presence and K-Pulse authorization are real server paths
- realtime presence audience honors privacy settings and masks private/invisible presence
- message history/persistence/receipts remain ciphertext-envelope only
- receipt persistence independently requires current conversation membership
- direct conversation creation/reuse uses contact/block checks plus transaction advisory locking
- authenticated `conversations:list` exposes only the verified user's conversations and safe metadata
- group create/member add/remove/promote/demote/leave and ownership transfer are transaction-backed and authorization checked server-side
- a partial unique index permits at most one group owner; migration 0005 carries the same guard for existing databases
- removed/leaving/banned sockets are evicted from group rooms; invited online sockets join only after DB authorization succeeds
- `groupModerationStore.ts` provides role-checked mute, ban and unban primitives; admins cannot moderate owners/admins and self-moderation is rejected
- migration 0006 adds `muted_until` plus backend-controlled `group_bans`; authenticated clients have no direct mutation grant
- strict mute/ban contracts reject forged extra moderation fields, validate ISO mute expiry and bound ban reasons to 240 characters
- group-scoped moderation read requests use the strict UUID-only `groupConversationSchema`; regression coverage rejects forged actor fields before Socket.IO exposure is added
- `addGroupMember` rejects any target still present in `group_bans`; unban must occur first
- `persistEncryptedMessage()` enforces group mute status before insertion
- `group:mute`, `group:ban` and `group:unban` are registered and CI-validated
- `setGroupMute()` now returns `mutedUntil` as an ISO timestamp string (or null), matching the fail-closed mobile moderation event contract instead of relying on implicit Date serialization
- `listGroupBans()` provides a bounded (max 200), profile-shaped ban list only after a transaction-scoped owner/admin check; its `bannedAt` field is normalized server-side to an ISO timestamp string
- Socket.IO exposure of the moderator-only ban list is still pending on the current head

## Mobile Runtime
Completed and CI-validated unless explicitly noted:
- Neon Auth/Data API client is explicit through `backend.ts`; obsolete mobile Supabase compatibility shim is removed
- authenticated Socket.IO endpoint is `EXPO_PUBLIC_KSSENGER_SOCKET_URL`
- reconnect resolves a fresh Neon Auth access token for every initial connection/reconnection
- app lifecycle publishes online/away/offline presence
- Contacts uses real server contacts/search/requests, real presence updates and debounced login events
- K-Pulse sends/receives through the real authorization/rate-limit path
- profile editing supports display name, username, custom status, bio, HTTPS avatar URL and now-playing title/artist
- privacy settings control online visibility, music visibility, K-Pulse policy, login alerts and direct-chat read receipts through self-scoped Neon RLS
- direct conversations honor `read_receipts=false` by emitting delivered-only receipts while open
- selecting a contact opens/reuses a real direct conversation and loads encrypted-envelope history
- Chats private list uses authenticated `conversations:list`
- Groups lists/creates/opens real groups and renders real members/presence/history
- owner/admin group controls call real server mutations for invite/remove/promote/demote/ownership transfer/leave
- mobile moderation helpers mirror backend role boundaries, build bounded mute/unmute/ban/unban payloads and defensively normalize incoming moderation events
- moderator-only banned-user list responses have a typed mobile contract and fail-closed normalization: malformed entries, invalid dates and responses above the backend 200-entry bound are rejected before UI consumption
- `groupModerationRealtime.ts` centralizes authenticated realtime mute/unmute/ban/unban requests, ack validation and the future `group:bans-list` call so `GroupsScreen` does not duplicate low-level socket handling
- group moderation controls are not yet exposed in `GroupsScreen`; moderator-only banned-user Socket.IO listing must be wired before unban UX
- group read-receipt preference parity is not yet complete
- plaintext message sending remains intentionally locked until a vetted native E2EE protocol/device-key path is integrated and device-tested
- authenticated account export is exposed; exported messages remain encrypted envelopes

## Social Identity Direction
K-ssenger recreates the alive, presence-first feel of classic social messengers without copying Microsoft branding/assets:
- presence is a first-class social signal
- contacts can show expressive display names, custom status and current music
- login alerts recreate the “someone just came online” moment with user-controlled privacy
- K-Pulse is the public K-ssenger attention mechanic; legacy `wizz` naming remains internal compatibility only
- privacy controls remain stronger than the nostalgic behavior they enable

## Neon Social Modules Prepared
CI-validated Neon-native schema covers:
- K-Feed vertical-video metadata, moderation state, reports and server-side age gating
- Moments, views, reactions and reports with expiry/friend/close-friend/block-aware reads
- K-MAP location shares and points
- approximate K-MAP recipients cannot directly read raw exact coordinates
- recipient-safe location RPC rounds approximate coordinates server-side
- owner can explicitly revoke a share
- direct active location shares auto-revoke when either party blocks the other
- explicit least-privilege grants for the Data API `authenticated` role

## Deployment / Release State
- dedicated public realtime endpoint is configured as `https://kssenger-server.onrender.com`; mobile preview points to the K-ssenger Render/Neon stack
- do not claim the latest server commit is deployed without deployment-version proof
- do not deploy the current moderation head before migration 0006 is approved/applied
- mobile realtime fails closed when `EXPO_PUBLIC_KSSENGER_SOCKET_URL` is missing
- Android debug APK CI builds through Expo prebuild + Gradle; earlier APK artifacts are verified
- no verified iOS signing environment or Apple signing credentials are available here

## Account / Auth Safety
- account export is implemented through authenticated Data API/RLS
- Better Auth user deletion must only be enabled with proper password/fresh-session/verification safeguards
- secure full account deletion remains unfinished; never fake deletion by deleting only the profile row

## Branding / Legal Safety
- preserve nostalgic messenger behavior while keeping K-ssenger independently branded
- do not imply Microsoft/MSN affiliation and do not ship Microsoft/MSN logos, copied assets or original sounds
- public attention feature name: `K-Pulse`
- trademark clearance remains required before commercial launch

## Remaining V1 Priorities
1. complete the real multi-user remote test with at least two devices/accounts: signup/login -> contacts -> presence/login alert -> K-Pulse -> direct/group open -> receipts -> group membership/moderation -> ownership transfer -> forced reconnect/token refresh
2. integrate a vetted native E2EE/device-key protocol, then enable actual private/group message sending; do not claim production E2EE before device proof
3. apply and verify K-Feed/Moments/K-MAP plus group-integrity/moderation migrations on the dedicated remote Neon branch through the explicit migration-approval flow
4. replace K-Feed/Moments/K-MAP placeholder UI with real Neon-native runtime after the remote schema/storage is ready
5. add approved native media upload/storage and push notifications; never store large media blobs in Postgres
6. wire moderator-only ban listing into Socket.IO, then expose Groups mute/unmute/ban/unban controls through the guarded mobile moderation client and consume moderation events
7. complete moderation/report/block UX and securely verified Auth account deletion
8. verify the current-head Android artifact, then move toward signed Android/iOS release builds when signing is available
9. release polish/design/logo comes after the functional/security gates, preserving the independent K-ssenger brand

## Hard Rules
- K-ssenger resources only
- never force-push
- never expose secrets
- never reuse another project's backend/database/deployment
- never weaken authorization to make tests pass
- never invent custom cryptography
- keep PR #2 draft while critical security/database/runtime gates remain unresolved
- never claim production E2EE without a vetted native protocol and device proof
