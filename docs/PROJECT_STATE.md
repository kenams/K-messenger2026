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
- CI #168 (`33816339120`) on documentation head `638a8435a09822901e386b91356c4abc47439de5`: SUCCESS
- the underlying group ownership-transfer functional change `6f0b7d929e75b481e3ba8c652f24a86d52346f02` is therefore CI-validated
- workspace/typecheck: SUCCESS
- server tests: SUCCESS
- core Alice/Bob/Charlie RLS integration suite: SUCCESS
- K-Feed/Moments/K-MAP isolated PostgreSQL 17 RLS suite: SUCCESS
- current functional head now includes DB-level single-owner enforcement in fresh core installs plus incremental migration `0005_group_single_owner.sql` for already-provisioned databases
- CI for the new DB-integrity head must complete before this new index is called validated
- earlier Android APK builds are verified successful, including APK #25 wired to the public Render + Neon configuration

## Dedicated Remote K-ssenger Backend
Only the dedicated free Neon project `K-ssenger` (`late-flower-65059830`) may be used.

Re-verified through the connected Neon project on 2026-09-04:
- PostgreSQL 17
- region `aws-eu-central-1`
- dedicated free project only
- Neon Auth / Better Auth and Data API remain the intended auth/data surfaces
- no other Neon project was touched during this run
- remote public schema remains on the previously verified ten core V1 tables until an approved migration step is performed
- message persistence remains ciphertext-envelope only and idempotent by `(sender_user_id, client_message_id)`

Important remote migration status:
- `neon/migrations/0002_social_content_location.sql`
- `neon/migrations/0003_social_content_grants.sql`
- `neon/migrations/0004_kmap_owner_revoke_policy.sql`
- `neon/migrations/0005_group_single_owner.sql`
are committed for the dedicated Neon design; 0002-0004 remain isolated-CI validated and not remotely applied, while 0005 is newly added and awaits CI plus explicit remote migration approval.
- applying remote schema changes requires an explicit migration approval step; never bypass that safeguard

## Server Runtime
Completed and CI-validated unless explicitly marked pending on the current head:
- Socket.IO access token authentication uses Neon Auth JWT/JWKS validation through `jose`
- identity is derived from verified JWT `sub`; client-supplied identity is never trusted
- server runtime has no `@supabase/supabase-js` dependency
- PostgreSQL access uses `pg`, parameterized SQL and explicit transactions
- contacts/request/accept/decline/cancel/remove/favorite/block paths are Neon/Postgres-backed
- presence and K-Pulse authorization are real server paths
- realtime presence audience honors `privacy_settings.show_online`; users set to `nobody` are not broadcast to contacts
- contacts/list and search mask invisible/private presence instead of leaking the stored state
- contact list exposes nickname, custom status and now-playing metadata only through privacy-aware server shaping
- `show_music='nobody'` suppresses now-playing title/artist from the contact list response
- message history/persistence/receipts remain ciphertext-envelope only
- direct conversation creation/reuse uses contact/block checks plus transaction advisory locking to prevent duplicate 1:1 conversations
- authenticated `conversations:list` returns only conversations where the verified user is a member and exposes safe metadata without plaintext/ciphertext bodies
- group creation/member add/remove/role promotion/demotion/leave are transaction-backed and authorization checked server-side
- group ownership transfer is transaction-backed with explicit row-count conflict checks: the current owner is demoted before the selected member is promoted
- the Neon core schema now also defines a partial unique index allowing at most one `owner` membership per conversation; incremental migration 0005 carries the same guard for existing databases
- removed/leaving sockets are evicted from group rooms; newly invited online sockets join only after DB authorization succeeds

## Mobile Runtime
Completed and CI-validated unless explicitly noted:
- Neon Auth/Data API client is explicit through `backend.ts`
- obsolete mobile Supabase compatibility shim removed
- authenticated Socket.IO client endpoint is `EXPO_PUBLIC_KSSENGER_SOCKET_URL`
- reconnect behavior resolves a fresh Neon Auth access token for every initial connection/reconnection
- app lifecycle publishes online/away/offline presence
- Contacts uses real server contacts/search/requests instead of fake demo data
- incoming vs outgoing contact requests are distinguished
- real presence updates and debounced login events are consumed
- K-Pulse sends/receives through the real authorization/rate-limit path
- contact groups/list names, nicknames, custom status and now-playing music are rendered from real backend data
- profile editing supports display name, username, custom status, bio, HTTPS avatar URL and now-playing title/artist
- login-event notices honor the local authenticated user's `login_notifications` preference (`all_contacts`, `favorites`, `nobody`)
- a real `Moi -> Vie privée` screen edits self-scoped Neon privacy settings for online visibility, music visibility, K-Pulse policy, login alerts and direct-chat read receipts
- direct conversations honor `read_receipts=false` by emitting only `delivered` instead of `read` while open
- selecting a contact opens/reuses a real direct conversation and loads encrypted-envelope history
- Chats private list uses authenticated `conversations:list` rather than static demo chats
- Groups lists/creates/opens real groups and renders real members/presence/history
- owner/admin group controls call real server mutations: invite contact, remove member, promote/demote admin, transfer ownership and leave group
- group read-receipt preference parity is not yet complete; current privacy UI explicitly describes the direct-chat behavior only
- plaintext message sending remains intentionally locked until a vetted native E2EE protocol/device-key path is integrated and device-tested
- authenticated account export is exposed; exported messages remain encrypted envelopes

## Social Identity Direction
K-ssenger should recreate the feeling that made classic social messengers alive without copying Microsoft branding/assets:
- presence is a first-class social signal, not only transport state
- contacts can show expressive display names, custom status and current music
- login alerts can recreate the “someone just came online” moment with user-controlled privacy
- K-Pulse is the outward K-ssenger attention mechanic; legacy `wizz` naming remains internal compatibility only
- favorites can drive stronger social signals without exposing everyone equally
- user privacy controls must remain stronger than the nostalgic behavior they enable

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

CI security checks include:
- under-18 user cannot read 18+ graphic K-Feed item
- eligible adult can read it
- contact can read friends-only Moment; stranger cannot
- approximate K-MAP recipient cannot SELECT raw point
- approximate RPC result is server-coarsened and accuracy floored to 1km
- stranger gets no K-MAP point
- owner can revoke
- block triggers direct-share revocation

## Deployment / Release State
- dedicated public realtime endpoint is configured as `https://kssenger-server.onrender.com` and the mobile preview configuration points to the K-ssenger Render/Neon stack
- the endpoint was reported healthy during the real-preview setup; this checkpoint does not claim that the latest privacy-aware server commit is already the deployed Render revision without a deployment-version proof
- mobile realtime fails closed when `EXPO_PUBLIC_KSSENGER_SOCKET_URL` is missing
- Android debug APK CI builds through Expo prebuild + Gradle
- earlier Android APK artifacts are verified; verify each newer functional head separately before treating it as the release candidate
- no verified iOS signing environment or Apple signing credentials are available here

## Account / Auth Safety
- account export is implemented through the authenticated Data API/RLS surface
- Better Auth supports authenticated user deletion only when deletion is enabled in auth configuration and protected by password/fresh-session/verification safeguards
- secure full account deletion remains unfinished; never fake deletion by deleting only the profile row

## Branding / Legal Safety
- preserve nostalgic messenger behavior while keeping K-ssenger independently branded
- do not imply Microsoft/MSN affiliation and do not ship Microsoft/MSN logos, copied assets or original sounds
- public attention feature name: `K-Pulse`
- trademark clearance remains required before commercial launch

## Remaining V1 Priorities
1. complete the real multi-user remote test with at least two devices/accounts: signup/login -> contacts -> presence/login alert -> K-Pulse -> direct/group open -> receipts -> group membership changes -> ownership transfer -> forced reconnect/token refresh
2. integrate a vetted native E2EE/device-key protocol, then enable actual private/group message sending; do not claim production E2EE before device proof
3. apply and verify K-Feed/Moments/K-MAP plus group-integrity migrations on the dedicated remote Neon branch through the explicit migration-approval flow
4. replace K-Feed/Moments/K-MAP placeholder UI with real Neon-native runtime after the remote schema/storage is ready
5. add approved native media upload/storage and push notifications; never store large media blobs in Postgres
6. finish remaining group lifecycle/product items such as mute/ban
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
