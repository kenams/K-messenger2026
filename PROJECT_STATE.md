# K-ssenger Project State

Last verified: 2026-09-05
Active delivery branch: `fix/feed-kmap-contact-security`
Active PR: #2 (`Security hardening + messaging reliability`) — intentionally draft while critical native/security/release gates remain open.

## Backend isolation

- Dedicated Neon project only: `late-flower-65059830` (`K-ssenger`).
- Region: `aws-eu-central-1`.
- Primary database: `kssenger`.
- Default Neon branch: `main` (`br-falling-sea-b1k36u32`), READY.
- Neon Auth provider: Better Auth, active on the dedicated K-ssenger branch.
- Neon Data API: active for `kssenger`, `public` schema only, OpenAPI disabled.
- Retired Supabase configuration is not used by the active V1 runtime. Historical Supabase migrations remain repository history only.
- No non-K-ssenger project/database is allowed or was modified during this verification.

## Live Neon V1 surface

Repository/live migrations are current through `0016_signal_group_prekey_claim.sql`.

Verified live security/data surfaces include:

- profiles/privacy, contacts/blocks, conversations/messages/receipts, group membership/moderation, K-Feed, Moments, K-MAP, push subscriptions and media metadata;
- private Neon Object Storage bucket `kssenger-media` with authorization-aware short-lived signed upload/download URLs;
- `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims` with RLS + FORCE RLS;
- contact-only active Signal device discovery (`devices_contact_active_read`);
- shared-group active Signal device discovery (`devices_shared_group_active_read`);
- `shares_group(uuid, uuid)` security-definer membership predicate;
- `claim_signal_prekey_bundle(uuid)` supporting authorized contacts or current group peers, block-aware fail-closed authorization, row locking/`SKIP LOCKED`, one-time EC/PQ claims and PQ last-resort fallback.

The dedicated K-ssenger Neon project/branch, Better Auth and Data API were re-inspected on 2026-09-05. `main` remains READY. No other Neon project was touched.

## Operational V1 modules

- Real Neon Auth email/password registration/login/session/password change.
- Username, display name, avatar, status, bio and music profile surfaces.
- Contacts lifecycle: search/request/accept/decline/cancel/remove/favorite/block/unblock plus blocked-user UI.
- Realtime presence with authenticated reconnect-safe socket sessions.
- K-Pulse/Wizz realtime attention interaction.
- Direct conversations with membership/block authorization, encrypted-envelope history, delivery/read receipts and reconnect resynchronization.
- Groups with create/invite/remove/roles/leave/ownership transfer plus mute/ban/unban/moderator ban listing.
- Account export v3; provider push tokens excluded and private messages remain encrypted envelopes.
- Account deletion UX/server route with password reauthentication, freshly issued Neon Auth token, explicit destructive confirmation, exact socket identity matching and hard-scoped K-ssenger Neon provider deletion. Provider deletion + FK cascade were live-proven with a disposable K-ssenger-only identity. Production server management credential validation remains a release gate.
- K-Feed uses real Neon/RLS rows, verified private media and native vertical video playback; no demo feed rows.
- Moments use real 24-hour Neon rows and verified photo/video media with visibility/delete/report; no demo Moment rows.
- K-MAP uses explicit foreground GPS, approximate/precise sharing, recipient selection, revoke and Ghost Mode; no hidden background tracking.
- Native Expo push registration on physical devices plus metadata-only server push payloads (no private message body).
- Private media promotion verifies MIME/size server-side before ready state and authorization is rechecked before signed downloads.

## E2EE implementation status

- No custom cryptographic protocol is used.
- Official Signal artifacts `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned from Signal's official Maven repository.
- `apps/mobile/modules/kssenger-signal` is an autolinked Expo Android module `KssengerSignalBridge`.
- `KeystoreBlobStore` stores opaque libsignal records encrypted with AES-256/GCM behind a non-exportable Android Keystore key; private record bytes do not cross the JS bridge.
- Native stores implement official libsignal `SessionStore`, `IdentityKeyStore`, `PreKeyStore`, `SignedPreKeyStore` and `KyberPreKeyStore` contracts.
- Kyber storage supports encrypted persistence, one-time consumption and replay tracking for last-resort `(kyber id, signed prekey id, base key)` tuples.
- `SignalDeviceProtocol` provides native device provisioning, public bundle publication data, claimed remote-bundle processing, session presence, encrypt/decrypt and native-only private key/session state.
- Android E2EE Runtime #26 is GREEN on commit `e975fc908d12ac67a7baf2828780e809dddc3979`. The Android 35 emulator successfully executed the real native libsignal instrumentation step end-to-end: EC + signed + Kyber provisioning, official `PreKeyBundle` processing, first `PreKeySignalMessage`, one-time EC/PQ consumption, Bob reply as normal `SignalMessage`, Alice decrypt and surviving ratchet sessions.
- Commit `6a2a55cc54a6a504a7b460547606a0c9787443e2` extends instrumentation to recreate both `SignalDeviceProtocol` instances from the same installation UUIDs after session establishment and then continue bidirectional `SignalMessage` ratcheting. This proves app/process-object recreation uses Android-Keystore-backed persisted identity/session state rather than an in-memory-only test path once its runtime workflow is green.
- Private/group plaintext composition remains fail-closed until real two-physical-device validation is completed.
- K-ssenger must not claim production E2EE until the physical device proof passes.

## Validation state

- CI #387 on commit `e975fc908d12ac67a7baf2828780e809dddc3979` is GREEN.
- Android E2EE Runtime #26 on the same commit is GREEN. Its `Execute native libsignal PQXDH and Double Ratchet instrumentation` step completed successfully on Android 35.
- Commit `6a2a55cc54a6a504a7b460547606a0c9787443e2` adds persistence/recreation coverage and is the current E2EE validation target.
- Dedicated Neon project `late-flower-65059830`, branch `br-falling-sea-b1k36u32`, Better Auth and Data API were re-inspected and remain active/READY. No other Neon project was touched.

## Security invariants

- Authenticated realtime identity comes only from verified Neon Auth JWT `sub`.
- Destructive account deletion additionally requires a newly issued token and exact authenticated socket identity equality.
- Never accept caller-supplied user IDs as authenticated identity.
- Never weaken RLS/authorization to unblock UX.
- Never expose database/provider secrets in mobile builds.
- Never log private plaintext, auth tokens, private keys or session records.
- Never invent custom cryptography.
- Do not claim production E2EE until vetted native libsignal integration is proven on real devices.
- Private/group plaintext composition stays locked until the E2EE gate is satisfied.
- K-MAP remains explicit opt-in; no background/permanent hidden tracking.

## Remaining premium V1 release gates

1. Obtain a green runtime on the new persistence/recreation instrumentation commit `6a2a55cc54a6a504a7b460547606a0c9787443e2`.
2. Complete the real two-physical-device server-mediated Signal proof covering device discovery/prekey claim, identity continuity, one-time/PQ prekeys, ratchet continuity, reinstall/device revocation and offline/reconnect before unlocking private/group plaintext composition.
3. Configure the server-only Neon management credential on the K-ssenger production server and validate full in-app self-delete with a disposable password-authenticated account, including fresh-token enforcement/stale-session rejection.
4. Validate private media end-to-end on physical Android/iOS: avatar/chat/K-Feed/Moments upload, playback/download authorization and recovery paths.
5. Validate real-device Android/iOS push delivery and K-MAP GPS permission flows.
6. Run the final two-device smoke across offline/reconnect, receipts, groups, media, push and E2EE.
7. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

Keep PR #2 draft while any critical security/native gate above remains incomplete. Do not merge, unlock plaintext or label this production E2EE merely to obtain a release build.
