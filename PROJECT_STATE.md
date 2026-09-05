# K-ssenger Project State

Last verified: 2026-09-05
Active delivery branch: `fix/feed-kmap-contact-security`
Active PR: #2 (`Security hardening + messaging reliability`) — intentionally kept as draft while critical native/security gates remain open.

## Backend isolation

- Dedicated Neon project only: `late-flower-65059830` (`K-ssenger`).
- Region: `aws-eu-central-1`.
- Primary database: `kssenger`.
- Default Neon branch: `main` (`br-falling-sea-b1k36u32`), READY.
- Managed Neon Auth and Neon Data API are the only identity/data backend for the active V1.
- Retired Supabase project configuration is not used by the active V1.
- No non-K-ssenger database/project was modified during this run.

## Live Neon V1 surface

The dedicated live database contains the active V1 tables for profiles/privacy, contacts/safety, conversations/messages/receipts, group moderation, K-Feed, Moments, K-MAP and push subscriptions.

New live infrastructure applied and verified in this run:

- `media_objects`: metadata layer for the private Neon Object Storage bucket `kssenger-media`; RLS + FORCE RLS enabled with owner/chat-member isolation. Clients may register only pending objects under their own user-id prefix and cannot promote them to ready.
- `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims`: public-key distribution layer for Signal/libsignal PQXDH. All four tables have RLS + FORCE RLS enabled.
- `claim_signal_prekey_bundle(uuid)`: authenticated contact-only, block-aware, atomic prekey claim using row locking/`SKIP LOCKED`, one claim per caller/device/bundle version and post-quantum last-resort fallback.

Repository Neon migrations now run through `0011_signal_prekeys.sql`.

## Operational / implemented

- Real Neon Auth email/password login/session and password change.
- Username, display name, avatar/status/bio/music profile surfaces.
- Contacts lifecycle: search/request/accept/decline/cancel/remove/favorite/block/unblock plus blocked-user UI.
- Presence plus reconnect-safe realtime session authentication.
- K-Pulse/Wizz realtime attention interaction.
- Direct conversations with membership/block authorization, ciphertext-envelope history, delivery/read receipts and reconnect resynchronization.
- Groups with create/invite/remove/roles/leave/ownership transfer plus mute/ban/unban/moderator ban listing.
- Privacy-safe account export v3. Provider push tokens are excluded and private messages remain encrypted envelopes.
- Account deletion UX and server path are implemented with password reauthentication, a freshly issued verified Neon Auth token, explicit `DELETE` confirmation, exact socket-identity match and a hard-coded K-ssenger Neon project/branch management route. The action fails closed when the server-only Neon management credential is absent.
- K-Feed backed by real Neon/RLS metadata and reporting; demo rows removed.
- Moments backed by real 24-hour Neon rows for text moments, visibility/delete/report; demo rows removed.
- K-MAP includes native foreground GPS capture, explicit approximate/precise sharing, recipient selection, revoke and Ghost Mode. No background hidden tracking.
- Mobile push registration uses native Expo notification permission/token registration on physical devices; server delivery sends metadata-only notifications without private message bodies.
- Private Neon Object Storage bucket `kssenger-media` exists and its database authorization metadata is live.

## E2EE status

- K-ssenger does not use custom cryptography.
- The official Signal Messenger Android artifacts `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned through an Expo config plugin and Signal's official Maven repository.
- Android `expo prebuild` with that plugin has passed in workflow run #70; the native Gradle APK build is still a release gate until the workflow completes successfully.
- The live PQXDH prekey server surface is deployed as described above. It stores public key material only; device private keys must remain native/on-device.
- Private/group plaintext composition remains locked. Production E2EE must not be claimed until the native libsignal bridge/session stores are integrated and two real devices prove encrypt/decrypt, identity verification, prekey consumption, ratchet continuity and reinstall/device-revocation behavior.

## Validation

- Previous CI on head `01a4d5fa728788fa887035b655bb46e9f6201ece` was green.
- Media RLS integration suite is now part of CI and passed on run #313 together with core/social/push RLS.
- CI run #313 exposed a server unit-test contract regression caused by initially attaching account deletion to the moderation registrar. The deletion handler was separated and the regression fixed in subsequent commits; the newest head must return green before release.
- Real remote social smoke remains green after the server changes.
- Account deletion provider scope has dedicated regression tests that assert the fixed K-ssenger project/branch URL, DELETE method, fail-closed missing credential behavior and provider failure behavior.
- Android Internal APK workflow run #70 passed dependency install, K-ssenger endpoint validation and Expo Android prebuild with official libsignal; Gradle assembly remains in progress at this verification point.

## Security invariants

- Authenticated realtime identity comes only from verified Neon Auth JWT `sub`.
- Destructive account deletion additionally requires a newly issued token no older than five minutes and exact identity equality with the authenticated socket.
- Never accept a caller-supplied user ID as authenticated identity.
- Never weaken RLS/authorization to unblock UX.
- Never expose database/provider secrets in mobile builds.
- Never log private plaintext, tokens or encryption keys.
- Never invent custom cryptography.
- Do not claim production E2EE until vetted native libsignal integration is proven on real devices.
- Private/group plaintext composition stays locked until that E2EE gate is satisfied.
- K-MAP remains explicit opt-in; no background/permanent hidden tracking.

## Remaining premium V1 release gates

1. Finish the native libsignal bridge/session/secure-device-key implementation and two-device E2EE proof before unlocking private/group plaintext composition.
2. Finish private media upload/download signing and validation against `kssenger-media`, then wire avatar/chat/K-Feed/Moments creation to it.
3. Configure the server-only Neon management credential on the K-ssenger production server and validate self-delete with a disposable K-ssenger account, including cascade cleanup and stale-session rejection.
4. Complete real-device Android/iOS push delivery and K-MAP GPS permission validation; implementation exists but device proof remains required.
5. Full real two-device smoke covering offline/reconnect, push, receipts, groups, media and E2EE.
6. Store-signed Android and iOS builds when signing credentials/tooling are available.

## Release rule

Keep PR #2 draft while any critical security/native gate above remains incomplete. Do not merge or call this production E2EE merely to obtain a release build.
