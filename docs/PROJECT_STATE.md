# K-ssenger Project State

Last verified: 2026-09-06

This is the canonical project state file. Keep `PROJECT_STATE.md` at the repository root as a pointer only.

## Repository

- Repository: `kenams/K-messenger2026`.
- Active branch: `fix/feed-kmap-contact-security`.
- Base: `bootstrap/platform`.
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT and mergeable. Keep it draft while the real-device/security gates below remain open.
- Never force-push.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Branch: `br-falling-sea-b1k36u32` / `main`.
- Database: `kssenger`.
- Region: `aws-eu-central-1`, PostgreSQL 17.
- Neon Auth is the managed Better Auth integration on this branch; the live schema uses the current `neon_auth.user/account/session/...` layout.
- Neon Data API is active for the dedicated K-ssenger backend.
- Runtime Supabase assumptions are retired; historical migration references are not an active backend.
- CI fails if Supabase packages, environment variables or hosted endpoints are reintroduced under active `apps/` or `packages/` runtime sources.
- CI fails if server/database credentials or secret-like `EXPO_PUBLIC_*` variables enter the mobile source/config surface.
- Mobile Neon configuration fails closed unless both public endpoints are exact HTTPS K-ssenger endpoints with no embedded URL credentials, query parameters or fragments.
- No other project/database is allowed to be modified.

## Latest verified delivery state

- Private avatar, chat, K-Feed and Moments media use authorization-aware private storage; signed mobile requests fail closed on invalid HTTPS/method/credentials/expiry metadata.
- The Neon-only runtime and mobile secret-surface gates are mandatory in CI.
- Contact removal and blocking revoke active direct K-MAP shares at the database boundary; trigger-only `SECURITY DEFINER` execution is owner-only on live Neon.
- `709be4f58e9586851d50b27406ec906df50b9282` is verified GREEN in CI #463 and Android E2EE Runtime #108.
- Mobile release metadata is now V1: app version `1.0.0`, iOS build `1`, Android versionCode `1`, stable `com.kahdigital.kssenger` identifiers and Expo runtime compatibility tied to `appVersion`.
- Android Internal APK #117 completed successfully after the V1 metadata change and produced the installable internal release artifact. It is not a store-signed production release.
- A mandatory release-metadata regression test prevents the app from silently reverting to pre-V1 version/build identifiers.
- Repository migration `0019_account_delete_fk_semantics.sql` fixes deletion-blocking foreign keys for active users: shared conversations and moderation history survive with anonymized actor fields, while the deleted account's encrypted messages are removed.
- `scripts/neon-account-delete-fk-integration-test.mjs` is restricted to localhost Postgres and proves those deletion semantics with a disposable synthetic identity; it is mandatory in CI.
- The obsolete Better Auth `/delete-user` probe was removed because K-ssenger does not use that endpoint. K-ssenger deletes through its authenticated server route plus the official branch-scoped Neon Auth management API.
- Remote V1 Smoke #28 is GREEN after that correction. The real Alice/Bob/Charlie remote suite passes 30/30 across auth/profile, contacts, presence, K-Pulse, encrypted message transport contracts, receipts, reconnect, groups/moderation, K-MAP, Moments, K-Feed and Signal prekey paths.
- `239aedc1700af5b7fd4e9b663a98feb5ae8f963b` is verified GREEN in CI #471 and Android E2EE Runtime #116.
- `bcbec0296e24ede70134a379eff99f7894da9096` adds a mandatory mobile account-deletion safety contract: password reauthentication, exact `DELETE` confirmation, authenticated server delegation, and disconnect/sign-out only after a positive server acknowledgement.
- `1078fc18ca9a54cd210871770cf770427fc0b01e` adds a read-only live Neon release-readiness gate. It refuses the wrong project, verifies the `kssenger` database, RLS/FORCE RLS, K-MAP revocation triggers/ACLs and the three account-deletion FK actions without mutating live data.
- `4d94517dece78afe0f2264b4287626aec3af5fd5` exposes that gate as `npm run release:check-neon-live`.

## Live Neon surface

The dedicated live database remains the only allowed backend.

Direct inspection confirms:
- all 26 public tables have RLS enabled;
- FORCE RLS is enabled on `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims`, `media_objects` and `push_subscriptions`;
- `revoke_location_on_block` is installed on `blocks`;
- `revoke_location_on_contact_removal` is installed on `contacts` and invokes `public.revoke_location_shares_on_contact_removal()`;
- the contact-removal trigger function is `SECURITY DEFINER` with a fixed `search_path` and owner-only live ACL (`kssenger_owner`);
- contact/shared-group Signal device discovery and `claim_signal_prekey_bundle(uuid)` remain fail-closed and block-aware.

A disposable historical smoke identity was successfully removed with the current branch-scoped Neon Auth management API and verified absent from `neon_auth.user`. The old management-provider 404 is therefore not a current platform blocker.

Migration `0019_account_delete_fk_semantics.sql` is repository/CI validated but is not silently applied to live Neon. A fresh read-only inspection on 2026-09-06 confirms all three targeted live foreign keys are still `NO ACTION`: `conversations_created_by_fkey`, `messages_sender_user_id_fkey`, and `group_bans_banned_by_fkey`. The live release-readiness command is intentionally expected to fail this gate until the controlled migration is applied.

## Operational V1 modules

- Real Neon Auth email/password registration, login and persisted session.
- Profile bootstrap, username, display name, status, bio, music and private avatar media.
- Contacts search/request/accept/decline/cancel/remove/favorite/block/unblock.
- Authenticated realtime presence and K-Pulse/Wizz behavior.
- Direct conversations with native-libsignal encrypted multi-device envelopes, delivery/read receipts and reconnect history synchronization. No plaintext transport fallback.
- Groups with create/invite/remove/roles/leave/ownership transfer plus mute/ban/unban and moderator ban listing.
- K-Feed vertical video backed by real Neon rows and verified private media.
- Moments backed by real expiring Neon rows and verified private photo/video media.
- K-MAP with explicit foreground permission, approximate/precise sharing, recipient controls, revoke, Ghost Mode, block-time revocation and contact-removal revocation.
- Native push registration and metadata-only server push payloads.
- Account export v3.
- Account deletion UI/server route with password reauthentication, fresh Neon token and provider scope hard-coded to the dedicated K-ssenger project/branch. Repository deletion semantics are FK-safe; controlled live migration + disposable in-app proof remain open.
- Release candidate metadata is `1.0.0` and an Android internal release APK can be produced by CI.

## E2EE

- No custom cryptographic protocol.
- Official `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned.
- Native Android Session/Identity/PreKey/SignedPreKey/KyberPreKey stores persist behind Android Keystore protected storage.
- Android runtime proof is GREEN for real libsignal PQXDH/prekey establishment, one-time EC/PQ consumption, first PreKeySignalMessage, normal SignalMessage reply, Double Ratchet continuity and native-store recreation.
- Direct and group composers stay fail-closed if native E2EE readiness is not proven.
- Do not claim production E2EE until a real two-physical-device server-mediated proof passes.
- iOS native libsignal parity is still absent; iOS remains fail-closed.

## Security invariants

- Realtime identity comes only from verified Neon Auth JWT `sub`.
- Caller-supplied user IDs never define authenticated identity.
- RLS/authorization must never be weakened to unblock UX.
- Mobile builds must never contain database/provider secrets.
- Plaintext, auth tokens, private keys and Signal session records must never be logged.
- No invented cryptography.
- K-MAP is explicit opt-in; no hidden background/permanent tracking.
- Blocking or removing a contact revokes active direct K-MAP shares at the database boundary.
- Trigger-only `SECURITY DEFINER` functions must not be directly executable by API roles.
- K-ssenger is independent from Microsoft and must not use Microsoft branding/assets/sounds or affiliation language.

## Remaining Premium V1 release gates

1. Controlled live application/verification of repository migration `0019_account_delete_fk_semantics.sql`, followed by a disposable in-app account-delete proof including failed sign-in afterward.
2. Real two-physical-device Android Signal proof through the production server: discovery/prekey claim, identity continuity, ratchet continuity, revocation and reconnect.
3. Physical Android validation of avatar/chat/K-Feed/Moments media, push delivery and K-MAP GPS permission flows; repeat on iOS once native parity exists.
4. Final Alice/Bob/Charlie physical smoke: contacts, presence, K-Pulse, direct chat, offline/reconnect, receipts, groups, media, push, K-Feed, Moments, K-MAP, block/export/delete.
5. Implement and prove vetted native iOS libsignal parity.
6. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

An emulator test, green CI, management-API deletion or an APK assembly alone is not a production-E2EE declaration. Keep PR #2 draft until the critical physical-device/security gates are proven. Android internal builds may continue to be produced for real-device validation.
