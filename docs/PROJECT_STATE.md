# PROJECT STATE

## Repository
`kenams/K-messenger2026`

## Active Integration
- `main` - documentation baseline only
- `bootstrap/platform` - implementation base
- `fix/feed-kmap-contact-security` - active hardening/integration branch
- PR #2 `Security hardening + messaging reliability` -> `bootstrap/platform` - OPEN, DRAFT, mergeable
- keep PR #2 draft until authenticated remote Neon validation, deployed realtime runtime and the critical V1 user flow are proven end to end

## Latest Verified GitHub State
Verified on 2026-09-03:
- latest functional head: `756a081f4a9f9d576b6896c7eb78cbd0e938cc0c`
- CI #148 (`33807145021`): SUCCESS
- workspace typecheck: SUCCESS
- server tests: SUCCESS
- core Alice/Bob/Charlie RLS suite: SUCCESS
- K-Feed/Moments/K-MAP RLS integration suite: SUCCESS
- Android Debug APK #19 completed successfully and uploaded artifact `k-ssenger-android-debug`
- Android Debug APK #22 for the latest functional head is still building and must not be called successful until GitHub reports completion and uploads the artifact

## Dedicated Remote K-ssenger Backend
Only the dedicated free Neon project `K-ssenger` (`late-flower-65059830`) may be used.

Re-verified through the connected Neon project on 2026-09-03:
- PostgreSQL 17
- region `aws-eu-central-1`
- database `kssenger`
- project remains on the free plan
- Neon Auth provider: Better Auth
- email/password authentication enabled
- branch-specific Auth/JWKS endpoints active
- Neon Data API active for schema `public`
- remote public schema still contains only the ten core V1 tables: `profiles`, `privacy_settings`, `contacts`, `contact_requests`, `blocks`, `conversations`, `conversation_members`, `devices`, `messages`, `message_receipts`
- no K-Feed/Moments/K-MAP migration is claimed as remotely applied yet
- core RLS was previously verified remotely
- message persistence remains ciphertext-only and idempotent by `(sender_user_id, client_message_id)`

Important remote migration status:
- `neon/migrations/0002_social_content_location.sql`
- `neon/migrations/0003_social_content_grants.sql`
- `neon/migrations/0004_kmap_owner_revoke_policy.sql`
are committed and CI-validated against isolated PostgreSQL 17, but are NOT claimed as applied to the remote Neon project yet.
- do not claim remote K-Feed/Moments/K-MAP tables until those migrations are explicitly applied and re-verified against the dedicated K-ssenger branch

## Server Runtime
Completed and CI-validated:
- Socket.IO access token authentication uses Neon Auth JWT/JWKS validation through `jose`
- identity is derived from verified JWT `sub`; client-supplied identity is not trusted
- server runtime has no `@supabase/supabase-js` dependency
- PostgreSQL access uses `pg`, parameterized SQL and explicit transactions
- contacts/request/accept/decline/cancel/remove/favorite/block paths are Neon/Postgres-backed
- presence and K-Pulse authorization are real server paths
- message history/persistence/receipts remain ciphertext-envelope only
- direct conversation creation/reuse uses contact/block checks plus transaction advisory locking to prevent duplicate 1:1 conversations
- authenticated `conversations:list` returns only conversations where the verified user is a member and exposes member role plus safe last-message metadata without plaintext/ciphertext bodies
- group creation is transaction-backed and restricted to contacts with block checks
- group member add/remove, role promotion/demotion and leave operations are transaction-backed
- group member add requires owner/admin, target contact status and no block conflict with current members
- admin cannot remove owner/admin; only owner can promote/demote; owner cannot silently leave without ownership transfer
- removed/leaving sockets are evicted from the group Socket.IO room; newly invited online sockets are joined only after database authorization succeeds

## Mobile Runtime
Completed and CI-validated:
- Neon Auth/Data API client is explicit through `backend.ts`
- obsolete mobile Supabase compatibility shim removed
- authenticated Socket.IO client uses the current Neon access token; endpoint is `EXPO_PUBLIC_KSSENGER_SOCKET_URL`
- reconnect behavior enabled
- app lifecycle publishes online/away/offline presence
- Contacts screen uses real server contacts instead of fake demo data
- real contact list/search/request/accept flows are wired to Socket.IO
- incoming vs outgoing contact requests are distinguished
- real presence updates/login events are consumed
- K-Pulse sends/receives through the real server path
- selecting a contact opens/reuses a real direct conversation and loads encrypted-envelope history
- direct conversations emit authenticated `read` receipts for remote messages when open and consume realtime receipt updates
- Chats private list uses authenticated `conversations:list` rather than static demo chats
- Groups screen lists real groups and creates groups from selected contacts
- opening a group joins the authorized room, loads encrypted-envelope history, renders real members/presence and emits read receipts
- owner/admin controls are wired to real server mutations: invite contact, remove member, promote/demote admin and leave group
- plaintext message sending remains intentionally locked until a vetted native E2EE protocol/device-key path is integrated; no crypto workaround is permitted
- live Neon profile is rendered in the app shell
- username, display name, custom status, bio and HTTPS avatar URL editing are wired through Neon Data API/RLS
- authenticated account export is exposed; messages remain encrypted envelopes in the export

## Neon Social Modules Prepared
New CI-validated Neon-native schema covers:
- K-Feed video metadata, moderation state, reports and server-side age gating
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
- no K-ssenger realtime production deployment is verified yet; never reuse another project's deployment
- mobile realtime fails closed when `EXPO_PUBLIC_KSSENGER_SOCKET_URL` is missing
- Android debug APK CI is wired to the active branch and builds through Expo prebuild + Gradle
- at least one current integration APK artifact has completed successfully; latest-head APK #22 remains pending verification
- no verified iOS signing environment or Apple signing credentials are available here

## Account / Auth Safety
- account export is implemented through the authenticated Data API/RLS surface
- Better Auth supports authenticated user deletion only when deletion is enabled in the auth configuration and requires password/fresh-session/verification safeguards
- the current managed Neon Auth config does not expose an enabled self-delete setting in the checked configuration; do not fake deletion by deleting only the profile row
- secure full account deletion remains unfinished

## Branding / Legal Safety
- preserve the nostalgic messenger identity through presence, expressive profiles, login notifications and K-Pulse behavior while keeping K-ssenger independently branded
- do not imply Microsoft/MSN affiliation and do not ship Microsoft/MSN logos, copied assets or original sounds
- public attention feature name: `K-Pulse`
- legacy `wizz` naming may remain only as an internal compatibility/schema label until migrated safely
- trademark clearance remains required before commercial launch

## Remaining V1 Priorities
1. apply and verify K-Feed/Moments/K-MAP migrations on the dedicated remote Neon branch using an explicitly authorized migration step
2. deploy the dedicated K-ssenger realtime server and configure its public mobile endpoint; never reuse another project's deployment
3. perform real multi-user Neon Auth + remote runtime validation: account A/B -> contacts -> presence -> K-Pulse -> direct/group conversations -> read receipts -> group membership changes
4. integrate a vetted native E2EE/device-key protocol, then enable actual private/group message sending on devices; do not claim E2EE before proof
5. finish remaining group lifecycle items that require product/schema decisions such as mute/ban and ownership transfer
6. replace K-Feed/Moments/K-MAP placeholder UI with their Neon-native tables/runtime and approved media storage
7. add native media upload/storage and push notifications
8. complete moderation/report/block UX and correctly verified Auth account deletion
9. validate latest Android artifacts and later produce signed Android/iOS release builds when signing is available

## Hard Rules
- K-ssenger resources only
- never force-push
- never expose secrets
- never reuse another project's backend/database/deployment
- never weaken authorization to make tests pass
- never invent custom cryptography
- keep PR #2 draft while critical security/database/runtime gates remain unresolved
- never claim production E2EE without a vetted native protocol and device proof
