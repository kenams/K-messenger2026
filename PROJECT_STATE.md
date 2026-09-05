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

Live infrastructure applied and verified:

- `media_objects`: metadata layer for the private Neon Object Storage bucket `kssenger-media`; RLS + FORCE RLS enabled with owner/chat-member isolation. Clients may register only pending objects under their own user-id prefix and cannot promote them to ready.
- `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims`: public-key distribution layer for Signal/libsignal PQXDH. All four tables have RLS + FORCE RLS enabled.
- `claim_signal_prekey_bundle(uuid)`: authenticated contact-only, block-aware, atomic prekey claim using row locking/`SKIP LOCKED`, one claim per caller/device/bundle version and post-quantum last-resort fallback.
- Media content bindings connect verified `media_objects` to avatars, K-Feed and Moments instead of trusting arbitrary client URLs.

Repository Neon migrations run through `0013_media_content_bindings.sql`.

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
- K-Feed uses real Neon/RLS metadata, verified private media uploads, native vertical playback and reporting; demo rows are removed.
- Moments use real 24-hour Neon rows and verified photo/video media uploads with visibility/delete/report; demo rows are removed.
- K-MAP includes native foreground GPS capture, explicit approximate/precise sharing, recipient selection, revoke and Ghost Mode. No background hidden tracking.
- Mobile push registration uses native Expo notification permission/token registration on physical devices; server delivery sends metadata-only notifications without private message bodies.
- Private Neon Object Storage bucket `kssenger-media` exists. The server issues short-lived signed upload/download URLs only for the fixed K-ssenger project/branch/bucket, verifies uploaded MIME type and byte size before promotion, and re-checks chat/feed/Moment authorization before signed download.

## E2EE status

- K-ssenger does not use custom cryptography.
- The official Signal Messenger Android artifacts `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned through an Expo config plugin and Signal's official Maven repository.
- Android `expo prebuild` with that plugin has passed. The internal APK workflow fails closed unless both exact official libsignal `0.100.0` artifacts resolve in the release runtime classpath before `assembleRelease`.
- The live PQXDH prekey server surface is deployed as described above. It stores public key material only; device private keys remain native/on-device.
- `apps/mobile/modules/kssenger-signal` is an autolinked Android Expo native module named `KssengerSignalBridge`.
- The bridge verifies that the official libsignal runtime and its state-store interfaces are loadable.
- Native encrypted persistence exists in `KeystoreBlobStore`: libsignal record bytes are stored as opaque blobs encrypted with AES-256/GCM using a non-exportable Android Keystore key. Private record bytes never cross the React Native/JavaScript boundary.
- `SignalSessionStore` directly implements the official libsignal `SessionStore` interface and persists serialized `SessionRecord` objects with recipient/device indexes.
- `SignalPreKeyStore` now directly implements the official libsignal `PreKeyStore`; one-time EC prekeys are serialized by libsignal and encrypted at rest behind Android Keystore.
- `SignalSignedPreKeyStore` now directly implements the official libsignal `SignedPreKeyStore`, including an encrypted local index for rotation/history loading.
- `SignalIdentityKeyStore` now directly implements the official libsignal `IdentityKeyStore`: the local identity pair and registration id are generated natively once, persisted encrypted, and remote identities use fail-closed TOFU replacement detection. Identity/private bytes never cross the JavaScript boundary.
- `deviceKeyStoreReady` and `selfTestPassed` remain deliberately false until the Kyber store is implemented and all native stores are exercised together by a real Alice/Bob libsignal session.
- Private/group plaintext composition remains locked. Production E2EE must not be claimed until two real devices prove encrypt/decrypt, identity verification, prekey consumption, ratchet continuity and reinstall/device-revocation behavior.

## Validation

- CI run #349 was green on head `cef15b54f482d447605f82aeab04d02543d1e657` before this run.
- This run added native official-libsignal stores in commits `52d072ba182c690af782a8bc53b8f23cb1283d4e`, `9b80d06fe17ca283d05336068c840aef73673f37`, and `3cb06b70139ba36bb619f31f6758c549642ef7fe`.
- CI and Android Internal APK validation were triggered for the new native-store head and remain release gates until green.
- The dedicated Neon project `late-flower-65059830` was re-inspected during this run; it remains the K-ssenger free-v3 project in `aws-eu-central-1`, and no other Neon project was touched.
- Media RLS integration uses transaction savepoints for expected authorization failures so negative tests cannot poison later assertions.
- Real remote social smoke remains green after the server changes.
- Account deletion provider scope has dedicated regression tests that assert the fixed K-ssenger project/branch URL, DELETE method, fail-closed missing credential behavior and provider failure behavior.
- Neon Auth management deletion was live-tested with a disposable K-ssenger-only user: provider deletion removed the Auth identity and FK cascade removed its profile row.

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

1. Implement the official native libsignal `KyberPreKeyStore`, wire all identity/prekey/session/PQ stores into one native protocol store, then add a real native Alice/Bob PQXDH/Double-Ratchet encrypt/decrypt self-test and two-device proof before unlocking private/group plaintext composition.
2. Configure the server-only Neon management credential on the K-ssenger production server and validate the full in-app self-delete route with a disposable password-authenticated account, including fresh-token enforcement and stale-session rejection. Provider-side deletion + FK cascade are proven.
3. Validate the completed private media pipeline on physical Android/iOS devices, including avatar/chat/K-Feed/Moments upload, playback/download authorization and failure recovery.
4. Complete real-device Android/iOS push delivery and K-MAP GPS permission validation; implementation exists but device proof remains required.
5. Full real two-device smoke covering offline/reconnect, push, receipts, groups, media and E2EE.
6. Store-signed Android and iOS builds when signing credentials/tooling are available.

## Release rule

Keep PR #2 draft while any critical security/native gate above remains incomplete. Do not merge or call this production E2EE merely to obtain a release build.
