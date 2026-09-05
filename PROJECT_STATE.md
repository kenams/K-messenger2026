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

Verified live security/data surfaces include profiles/privacy, contacts/blocks, conversations/messages/receipts, group membership/moderation, K-Feed, Moments, K-MAP, push subscriptions, private media metadata, Signal device bundles/prekeys and FORCE RLS policies. Contact/shared-group Signal device discovery and `claim_signal_prekey_bundle(uuid)` remain fail-closed and block-aware.

The dedicated K-ssenger Neon project `late-flower-65059830` was re-inspected on 2026-09-05. It remains the only backend touched in this run, PostgreSQL 17 in `aws-eu-central-1`, free_v3.

## Operational V1 modules

- Real Neon Auth email/password registration/login/session/password change.
- Username, display name, avatar, status, bio and music profile surfaces.
- Contacts lifecycle: search/request/accept/decline/cancel/remove/favorite/block/unblock plus blocked-user UI.
- Realtime presence with authenticated reconnect-safe socket sessions.
- K-Pulse/Wizz realtime attention interaction.
- Direct conversations with membership/block authorization, native-libsignal multi-device encrypted envelopes, delivery/read receipts and reconnect resynchronization.
- Direct chat composer is wired end-to-end to native libsignal. There is no plaintext transport fallback.
- Groups with create/invite/remove/roles/leave/ownership transfer plus mute/ban/unban/moderator ban listing.
- Account export v3.
- Account deletion UX/server route with password reauthentication, freshly issued Neon Auth token, explicit destructive confirmation and hard-scoped K-ssenger provider deletion. The previously implemented `account:delete` socket handler is now registered in the real server connection path.
- K-Feed uses real Neon/RLS rows, verified private media and native vertical video playback; no demo feed rows.
- Moments use real 24-hour Neon rows and verified photo/video media with visibility/delete/report; no demo Moment rows.
- K-MAP uses explicit foreground GPS, approximate/precise sharing, recipient selection, revoke and Ghost Mode; no hidden background tracking.
- Native Expo push registration on physical devices plus metadata-only server push payloads.
- Private media handlers are now registered in the real Socket.IO connection path. A live API check exposed and fixed a critical Neon Object Storage presign routing bug: the full nested object key must be encoded as one path segment. Commit `9241ffac093f6ad18fbe690296fd305ea4e09b6b` fixed the runtime path.
- Commits `04ac5761a8c09d0584ec838676fb0b3a041d648f` and `82589ece6e35e22bd56f74bdc384f02683e3e4c3` add a dedicated `buildMediaPresignUrl` contract and CI regression coverage so nested avatar/chat/K-Feed/Moment object keys cannot silently regress to the broken multi-segment URL. Malformed/traversal-like keys are rejected before provider access.

## E2EE implementation status

- No custom cryptographic protocol is used.
- Official Signal artifacts `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned from Signal's official Maven repository.
- Native Android stores implement official Session/Identity/PreKey/SignedPreKey/KyberPreKey contracts behind Android Keystore encrypted persistence.
- `SignalDeviceProtocol` provides native provisioning, public bundle data, claimed remote-bundle processing, session presence, encrypt/decrypt and native-only private key/session state.
- Android E2EE Runtime #26 is GREEN on commit `e975fc908d12ac67a7baf2828780e809dddc3979`: Android 35 executed real libsignal EC + signed + Kyber provisioning, `PreKeyBundle`, first `PreKeySignalMessage`, one-time EC/PQ consumption, Bob reply as normal `SignalMessage`, Alice decrypt and ratchet sessions.
- Persistence/recreation instrumentation was corrected in `502e7bfbd7866f3484c6681d61d0363f42f00656` to complete the acknowledgement path before requiring normal post-restart Signal messages.
- K-ssenger must not claim production E2EE until real two-physical-device server-mediated proof passes.

## Validation state

- CI #395 on `9241ffac093f6ad18fbe690296fd305ea4e09b6b` is GREEN.
- Android E2EE Runtime #36 on that commit is still executing the native libsignal instrumentation step at this verification point; emulator setup completed successfully.
- New head `82589ece6e35e22bd56f74bdc384f02683e3e4c3` has CI #397 and Android E2EE Runtime #38 in progress, including the new media presign regression test.
- PR #2 remains draft by design.

## Security invariants

- Authenticated realtime identity comes only from verified Neon Auth JWT `sub`.
- Destructive account deletion requires a newly issued token and exact authenticated socket identity equality.
- Never accept caller-supplied user IDs as authenticated identity.
- Never weaken RLS/authorization to unblock UX.
- Never expose database/provider secrets in mobile builds.
- Never log private plaintext, auth tokens, private keys or session records.
- Never invent custom cryptography.
- Do not claim production E2EE until vetted native libsignal integration is proven on real devices.
- K-MAP remains explicit opt-in; no background/permanent hidden tracking.

## Remaining premium V1 release gates

1. Obtain green current native E2EE persistence/recreation instrumentation on the active head.
2. Complete the real two-physical-device server-mediated Signal proof covering device discovery/prekey claim, identity continuity, one-time/PQ prekeys, ratchet continuity, device revocation and offline/reconnect.
3. Configure the server-only Neon management credential on the K-ssenger production server and validate full in-app self-delete with a disposable password-authenticated account, including fresh-token enforcement/stale-session rejection.
4. Validate private media end-to-end on physical Android/iOS: avatar/chat/K-Feed/Moments upload, playback/download authorization and recovery paths. The server registration and Neon presign route bugs found on 2026-09-05 are fixed and regression-covered.
5. Validate real-device Android/iOS push delivery and K-MAP GPS permission flows.
6. Run the final two-device smoke across offline/reconnect, receipts, groups, media, push and E2EE.
7. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

Keep PR #2 draft while any critical security/native gate above remains incomplete. Do not merge or label this production E2EE merely to obtain a release build.
