# K-ssenger Project State

Last verified: 2026-09-05

This is the canonical project state file. Keep `PROJECT_STATE.md` at the repository root as a pointer only.

## Repository

- Repository: `kenams/K-messenger2026`.
- Active delivery branch: `fix/feed-kmap-contact-security`.
- Base branch: `bootstrap/platform`.
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT.
- PR #2 merge state at verified head `fda782567693d53c39d0419a9b1946db7d26b545`: `CLEAN`.
- Keep PR #2 draft until critical physical-device, security, media, push and release gates are proven.
- No force-push was used.

## Latest Verified GitHub State

Verified 2026-09-05 on remote head `fda782567693d53c39d0419a9b1946db7d26b545`:

- CI run `33973108678` succeeded: `test` and `rls-integration` passed.
- Remote Social Smoke run `33973106738` succeeded against the real K-ssenger Neon/Auth/Data API/realtime backend.
- Android E2EE Runtime run `33973108684` succeeded in 9m27s.
- Previous head `4674a664413139a3f7ef34ca696fbe7f057fcf08` fixed the K-Feed media-binding regression exposed by run `33972121474` (`INVALID_KFEED_MEDIA`) by making remote smoke scripts use authenticated media prepare/upload/complete before inserting K-Feed metadata.
- Previous run `33973000202` failed before the smoke script because the single Render `/health` wake request timed out. Head `fda782567693d53c39d0419a9b1946db7d26b545` fixed that by using a bounded retry health loop.
- This workspace expands Remote V1 Smoke with live Signal public bundle/prekey publication, contact/shared-group device discovery, atomic prekey claim, duplicate-claim rejection and block rejection checks. The workflow is also enabled on pushes to `fix/feed-kmap-contact-security` for backend/migration/smoke changes.

## Backend Isolation

- Dedicated Neon project only: `late-flower-65059830` (`K-ssenger`).
- Region: `aws-eu-central-1`.
- Primary database: `kssenger`.
- Default Neon branch: `main` (`br-falling-sea-b1k36u32`), READY.
- Neon Auth provider: Better Auth, active on the dedicated K-ssenger branch.
- Neon Data API: active for `kssenger`, `public` schema only, OpenAPI disabled.
- Retired Supabase configuration is not used by the active V1 runtime. Historical Supabase migrations remain repository history only.
- No non-K-ssenger project/database is allowed or was modified during this verification.

## Live Neon V1 Surface

Repository/live migrations are current through `0016_signal_group_prekey_claim.sql`.

Verified live security/data surfaces include profiles/privacy, contacts/blocks, conversations/messages/receipts, group membership/moderation, K-Feed, Moments, K-MAP, push subscriptions, private media metadata, Signal device bundles/prekeys and FORCE RLS policies. Contact/shared-group Signal device discovery and `claim_signal_prekey_bundle(uuid)` remain fail-closed and block-aware.

## Operational V1 Modules

- Real Neon Auth email/password registration/login/session/password change.
- Username, display name, avatar, status, bio and music profile surfaces.
- Contacts lifecycle: search/request/accept/decline/cancel/remove/favorite/block/unblock plus blocked-user UI.
- Realtime presence with authenticated reconnect-safe socket sessions.
- K-Pulse realtime attention interaction.
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
- Conversation and K-Pulse push triggers are invoked by the running server. Push delivery failure is fire-and-forget and cannot fail the underlying message/K-Pulse action. Payloads remain metadata-only.
- CI contains a production Socket.IO wiring guard covering extracted media/account/moderation handlers, push trigger invocation and the critical realtime V1 event surface.

## Real Production-Path Smoke Verified

Remote Social Smoke on head `fda782567693d53c39d0419a9b1946db7d26b545` used disposable Alice/Bob identities and verified:

- protected contact lifecycle.
- K-MAP approximate coordinate coarsening and revoke.
- Moments pending isolation and reaction authorization.
- K-Feed media prepare/upload/complete, verified media binding, pending moderation isolation and forged data rejection.

Existing Remote V1 Smoke covers disposable Alice/Bob/Charlie identities across auth, profiles, contacts, presence, K-Pulse, direct conversations, group moderation, receipts, K-MAP, Moments, K-Feed and reconnect. The current workspace expands that smoke with live Signal backend proof. These are live server/backend proofs, not substitutes for real physical-device validation.

## E2EE Implementation Status

- No custom cryptographic protocol is used.
- Official Signal artifacts `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned from Signal's official Maven repository.
- Native Android stores implement official Session/Identity/PreKey/SignedPreKey/KyberPreKey contracts behind Android Keystore encrypted persistence.
- `SignalDeviceProtocol` provides native provisioning, public bundle data, claimed remote-bundle processing, session presence, encrypt/decrypt and native-only private key/session state.
- Android E2EE Runtime run `33973108684` is GREEN and covers real libsignal EC + signed + Kyber provisioning, `PreKeyBundle`, first `PreKeySignalMessage`, one-time EC/PQ consumption, Bob reply as normal `SignalMessage`, Alice decrypt and ratchet sessions.
- Persistence/recreation instrumentation completes the acknowledgement path before requiring normal post-restart Signal messages.
- K-ssenger must not claim production E2EE until a real two-physical-device server-mediated proof passes.
- The local Expo libsignal module remains Android-only; iOS must stay fail-closed until vetted native Swift parity is implemented and proven.

## Android Release Hardening

- The internal APK build uses the dedicated public K-ssenger Neon Auth/Data API endpoints and K-ssenger Render socket endpoint only.
- Expo prebuild injects Signal's Maven repository, exact libsignal `0.100.0` dependencies and core-library desugaring.
- R8/ProGuard keep rules protect `org.signal.libsignal.**` and `com.kahdigital.kssenger.signal.**` so JNI/native module classes are not stripped or renamed in release builds.
- The Android APK workflow now fails before Gradle assembly unless those libsignal dependencies, desugaring configuration and ProGuard keep rules are visibly present in the generated Android project. This prevents publishing another apparently successful but launch-crashing release APK.

## Validation State

- Verified head `fda782567693d53c39d0419a9b1946db7d26b545`: CI run `33973108678`, Remote Social Smoke run `33973106738` and Android E2EE Runtime run `33973108684` are GREEN.
- Release-hardening guard committed as `4dd4d4033936e6db98c695119049df4d9bf04c89`; its new workflow run is the next validation target.
- Dedicated Neon project `late-flower-65059830` was re-verified directly on 2026-09-05: project name `K-ssenger`, PostgreSQL 17, free_v3, region `aws-eu-central-1`; branch `br-falling-sea-b1k36u32` remains backed by Better Auth for database `kssenger`.
- PR #2 remains draft by design.

## Security Invariants

- Authenticated realtime identity comes only from verified Neon Auth JWT `sub`.
- Destructive account deletion requires a newly issued token and exact authenticated socket identity equality.
- Never accept caller-supplied user IDs as authenticated identity.
- Never weaken RLS/authorization to unblock UX.
- Never expose database/provider secrets in mobile builds.
- Never log private plaintext, auth tokens, private keys or session records.
- Never invent custom cryptography.
- Do not claim production E2EE until vetted native libsignal integration is proven on real devices.
- K-MAP remains explicit opt-in; no background/permanent hidden tracking.
- K-ssenger is independent from Microsoft and must not use Microsoft branding/assets/sounds or affiliation language.

## Remaining Premium V1 Release Gates

1. Complete the real two-physical-device server-mediated Signal proof covering device discovery/prekey claim, identity continuity, one-time/PQ prekeys, ratchet continuity, device revocation and offline/reconnect.
2. Resolve the Neon provider `ACCOUNT_DELETE_PROVIDER_404` issue, then validate full in-app self-delete with a disposable password-authenticated account, including fresh-token enforcement/stale-session rejection. The branch-scoped deletion route currently matches Neon's documented API and the live auth table uses UUID IDs, so do not weaken auth or switch projects as a workaround.
3. Validate private media end-to-end on physical Android/iOS: avatar/chat/K-Feed/Moments upload, playback/download authorization and recovery paths.
4. Validate real-device Android/iOS push delivery and K-MAP GPS permission flows.
5. Run the final two-device smoke across offline/reconnect, receipts, groups, media, push and E2EE.
6. Implement and prove native iOS libsignal parity; the current local Expo module is Android-only and iOS must remain fail-closed until a vetted native bridge exists.
7. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release Rule

Keep PR #2 draft while any critical physical-device/security gate above remains incomplete. Do not merge or label this production E2EE merely to obtain a release build.
