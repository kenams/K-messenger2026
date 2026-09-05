# K-ssenger Project State

Last verified: 2026-09-05
Active delivery branch: `fix/feed-kmap-contact-security`
Active PR: #2 (`Security hardening + messaging reliability`) — intentionally draft while critical physical-device/security/release gates remain open.

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
- Account deletion UX/server route with password reauthentication, freshly issued Neon Auth token, explicit destructive confirmation and hard-scoped K-ssenger provider deletion. `account:delete` is registered in the real server connection path. Provider-side deletion remains externally blocked by `ACCOUNT_DELETE_PROVIDER_404` for a real authenticated Neon user and must not be bypassed by weakening authorization.
- K-Feed uses real Neon/RLS rows, verified private media and native vertical video playback; no demo feed rows.
- Moments use real 24-hour Neon rows and verified photo/video media with visibility/delete/report; no demo Moment rows.
- K-MAP uses explicit foreground GPS, approximate/precise sharing, recipient selection, revoke and Ghost Mode; no hidden background tracking.
- Native Expo push registration on physical devices plus metadata-only server push payloads.
- Private media handlers are registered in the real Socket.IO connection path. The nested Neon Object Storage presign key bug is fixed and regression-covered.
- Conversation and K-Pulse push triggers are now actually invoked by the running server; push delivery failure is fire-and-forget and cannot fail the underlying message/K-Pulse action. Payloads remain metadata-only.

## Real production-path smoke verified

The current branch includes real live-server / dedicated-Neon smoke validation using disposable Alice/Bob/Charlie identities:

- Group path: create, multi-member delivery, mute, ban, duplicate-ban rejection, unban, K-Pulse, self-moderation rejection and non-admin authorization rejection verified.
- Offline/reconnect path: Bob hard-disconnects, Alice sends three messages, Bob reconnects and recovers all three without duplicates, then read receipts flow back to Alice.
- K-Feed + Moments media path: prepare-upload -> object PUT -> complete-upload -> publish verified against live services; pending-moderation isolation and forged `storage_path` rejection remain enforced.

These are server/live-backend proofs, not substitutes for the remaining real physical-device validation.

## E2EE implementation status

- No custom cryptographic protocol is used.
- Official Signal artifacts `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned from Signal's official Maven repository.
- Native Android stores implement official Session/Identity/PreKey/SignedPreKey/KyberPreKey contracts behind Android Keystore encrypted persistence.
- `SignalDeviceProtocol` provides native provisioning, public bundle data, claimed remote-bundle processing, session presence, encrypt/decrypt and native-only private key/session state.
- Android E2EE runtime proof is GREEN and covers real libsignal EC + signed + Kyber provisioning, `PreKeyBundle`, first `PreKeySignalMessage`, one-time EC/PQ consumption, Bob reply as normal `SignalMessage`, Alice decrypt and ratchet sessions.
- Persistence/recreation instrumentation completes the acknowledgement path before requiring normal post-restart Signal messages.
- K-ssenger must not claim production E2EE until real two-physical-device server-mediated proof passes.

## Validation state

- Current head before this state sync: `e99cd0b645a64c5a057ff89ef5461f81c02593e1`.
- CI #400: GREEN on that head.
- Android E2EE Runtime #41: GREEN on that head.
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

1. Complete the real two-physical-device server-mediated Signal proof covering device discovery/prekey claim, identity continuity, one-time/PQ prekeys, ratchet continuity, device revocation and offline/reconnect.
2. Resolve the external Neon provider `ACCOUNT_DELETE_PROVIDER_404` issue, then validate full in-app self-delete with a disposable password-authenticated account, including fresh-token enforcement/stale-session rejection. Do not bypass this with weaker auth or a different project.
3. Validate private media end-to-end on physical Android/iOS: avatar/chat/K-Feed/Moments upload, playback/download authorization and recovery paths.
4. Validate real-device Android/iOS push delivery and K-MAP GPS permission flows.
5. Run the final two-device smoke across offline/reconnect, receipts, groups, media, push and E2EE.
6. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

Keep PR #2 draft while any critical physical-device/security gate above remains incomplete. Do not merge or label this production E2EE merely to obtain a release build.
