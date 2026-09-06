# K-ssenger Project State

Last verified: 2026-09-06

Canonical current state for `kenams/K-messenger2026`. `PROJECT_STATE.md` at repository root is only a pointer.

## Repository / release

- Active branch: `fix/feed-kmap-contact-security`, base `bootstrap/platform`.
- PR #2 `Security hardening + messaging reliability` is OPEN, DRAFT and mergeable. Never force-push.
- Keep the PR draft until critical database/physical-device/E2EE gates below are proven.
- Product release candidate is V1 `1.0.0`: Expo app version `1.0.0`, iOS build `1`, Android versionCode `1`, stable `com.kahdigital.kssenger` identifiers.
- Root, mobile and server npm package manifests are aligned to `1.0.0`; the static release gate rejects manifest/app version drift.
- Android Internal APK #117 previously produced an installable internal V1 release artifact. Store signing remains a separate release gate.
- Remote V1 Smoke #28 is GREEN with 30/30 Alice/Bob/Charlie application-path checks.
- Head `1825ca16bbe26b0de3e7623b2284c4a1438c126c` has CI #562 and iOS Native Prebuild #81 GREEN; Android E2EE Runtime #212 was still in progress at the latest check.
- `f2173abdff88ed17eb90b01bd0a8f6073bffa073` explicitly pins the Expo mobile V1 runtime to Hermes instead of depending on the SDK default, improving release determinism across Android/iOS builds.
- `f7bbc11789c6a7bd1aaa9d0eaaf2b0df80878014` makes Hermes a mandatory static release-gate invariant so a future runtime-engine drift fails CI.
- `356bddedc3a8892d375a40b457ca36bec4401b6c` explicitly blocks Android `ACCESS_BACKGROUND_LOCATION`; K-MAP remains foreground-only and cannot silently acquire always-on/background tracking capability through a transitive native dependency.
- `b7bdace1ef78d4776363503d96e4a1781bf73523` makes foreground-only location a release-gate invariant on both platforms: Android must block background location and iOS must not declare either always-location usage key.
- JWT, account-deletion and private-media tests are aligned with the exact dedicated K-ssenger Neon Auth/JWKS endpoints after stricter runtime pinning exposed stale fixtures.
- `f84b95cc3a50cc7491de3d5ca998a9d90d2c4518` pins `NEON_AUTH_AUDIENCE` to the exact public audience of the dedicated K-ssenger Neon Auth branch while retaining a safe default to that same value.
- `6de7ab08ec62c6792007eede4ff921fdf35c5001` makes the dedicated Neon Auth audience pin a mandatory static release-gate invariant.
- Native privacy disclosures are explicit for foreground location, photo library, camera and user-initiated microphone use; macOS prebuild validates the generated Info.plist.
- Persisted Neon Auth sessions are revalidated on foreground with stale-refresh race protection and offline-safe preservation.
- Android application backup is disabled and cleartext network traffic is forbidden; generated manifests and internal APK workflows verify these invariants.
- Internal Android APK artifacts include a verified SHA-256 checksum.
- Server startup fails closed unless Auth base URL, JWKS URL and audience exactly match the dedicated K-ssenger Neon branch.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Branch: `br-falling-sea-b1k36u32` / `main`.
- Database: `kssenger`, PostgreSQL 17, `aws-eu-central-1`.
- Managed Neon Better Auth + Neon Data API are the active backend. Runtime Supabase assumptions are retired and CI rejects their reintroduction.
- Realtime identity comes only from verified Neon Auth JWT `sub`.
- Mobile builds contain only public K-ssenger service endpoints; server/database/provider secrets are forbidden from the mobile surface.
- Server startup is pinned to the exact public Auth, JWKS and audience values of the dedicated K-ssenger Neon branch and fails closed on backend drift.
- No other Neon project/database may be modified.

## Live Neon security state

- All 26 public tables have RLS enabled.
- FORCE RLS remains enabled on `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims`, `media_objects` and `push_subscriptions`.
- K-MAP block and contact-removal revocation triggers are installed live. The contact-removal `SECURITY DEFINER` function has a fixed search path and owner-only execution ACL.
- Fresh live recheck during this run confirms the three public FKs targeted by `0019` are still `NO ACTION`: `conversations_created_by_fkey`, `messages_sender_user_id_fkey`, `group_bans_banned_by_fkey`. Production was not modified.
- Repository migration `0019_account_delete_fk_semantics.sql` changes those three to the intended deletion-safe semantics.
- A controlled temporary-branch dry-run already verified the migration schema diff exactly; production remains unchanged.
- `npm run release:check-neon-live` intentionally fails until `0019` is applied live.

## Operational Premium V1 surface

- Real email/password Neon Auth registration, login and persisted session. Persisted mobile auth is revalidated against Neon Auth on app foreground; transient offline failures preserve the existing session while confirmed no-session/revocation events clear it.
- Username, display name, status, bio/music and authorization-aware private avatar media.
- Contacts search/request/accept/decline/cancel/remove/favorite/block/unblock.
- Authenticated presence and K-Pulse/Wizz behavior.
- Direct conversations with native-libsignal multi-device envelopes, delivery/read receipts and reconnect history synchronization; no plaintext transport fallback.
- Groups with create/invite/remove/roles/leave/ownership transfer, mute/ban/unban and moderator ban listing. Creation and later invitations reject participant combinations that would bypass a user block.
- Private chat media with authorization-aware signed upload/download and strict signed-request validation.
- K-Feed vertical video with private media backing, age gating, sensitive-content warning and moderation reporting.
- Moments with real expiring rows, private photo/video media, visibility and moderation/reporting controls.
- K-MAP with explicit foreground permission, approximate/precise modes, recipient controls, revoke/Ghost Mode and database-boundary revocation on block/contact removal. Android background-location permission is explicitly blocked and iOS always-location declarations are forbidden by the release gate.
- Native push registration with metadata-only server payloads. Sensitive push fields are rejected before recipient lookup/provider delivery; sign-out revokes push state before ending auth session.
- Account export v3.
- Account deletion UI/server path requires password reauthentication, exact confirmation, fresh Neon token and hard-scoped Neon K-ssenger management deletion. Full in-app disposable proof waits on live `0019`. Android additionally purges deleted-account native Signal material and destroys its Keystore key after server success.
- Android release configuration disables platform backup and explicitly forbids cleartext network traffic; both are enforced by release/Android CI gates. Internal APK artifacts ship with a verified SHA-256 manifest for integrity checks.
- iOS release configuration explicitly forbids arbitrary ATS loads and local-network exemptions. K-MAP/media permission strings are K-ssenger-specific and the macOS prebuild gate verifies the generated Info.plist carries them.
- Expo V1 explicitly uses Hermes on mobile; release CI rejects runtime-engine drift.

## E2EE

- No custom cryptography.
- Official `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned.
- Android native Session/Identity/PreKey/SignedPreKey/KyberPreKey stores persist behind Android Keystore protected storage.
- Android emulator runtime proof is GREEN for PQXDH/prekey establishment, one-time EC/PQ consumption, first PreKeySignalMessage, SignalMessage reply, Double Ratchet continuity and native-store recreation on previously verified heads.
- Android release packaging strips desktop JNI artifacts and verifies the real Android `libsignal_jni.so` is present in the assembled APK.
- Direct/group composers fail closed if native E2EE readiness is not proven.
- Production E2EE is NOT claimed until a real two-physical-device server-mediated proof passes.
- iOS native project generation works, but vetted native LibSignalClient parity is not implemented; iOS E2EE remains deliberately fail-closed.

## Security invariants

- Never weaken RLS/authorization to unblock UX.
- Never log plaintext, auth tokens, private keys or Signal session records.
- Never invent cryptography or advertise production E2EE without device proof.
- Never expose database/provider secrets in mobile builds.
- Android platform backup must remain disabled and cleartext network traffic must remain forbidden for the release candidate.
- Internal Android release artifacts must include a verified SHA-256 checksum generated from the final APK.
- iOS App Transport Security must not allow arbitrary loads or local-network exemptions in the release candidate.
- Native foreground-location, photo-library, camera and microphone permission disclosures must remain explicit, feature-scoped and K-ssenger-specific; iOS prebuild must prove the generated Info.plist carries them.
- K-MAP must remain foreground-only: Android must explicitly block `ACCESS_BACKGROUND_LOCATION`, and iOS must not declare always-location usage descriptions.
- Mobile V1 must explicitly use Hermes so JS runtime selection cannot drift with framework defaults.
- The server must reject any Neon Auth base/JWKS/audience value other than the dedicated K-ssenger branch values; tests must exercise security behavior without weakening this startup pinning.
- K-MAP is explicit opt-in; no hidden permanent/background tracking.
- Push data is allow-listed metadata only.
- Blocking must not be bypassable through direct chat, initial group creation, later group invitation, presence, K-Pulse or K-MAP.
- Realtime rate limiting must remain bounded in memory and fail closed if live key capacity is exhausted.
- Persisted mobile authentication must be revalidated on foreground, stale refreshes must never overwrite a newer auth event, and transient offline failures must not falsely log the user out.
- Account deletion readiness audits the full public FK surface targeting `neon_auth.user` and must not leave account-scoped Signal secrets recoverable on the deleting Android device.
- K-ssenger is independent from Microsoft and must not ship Microsoft branding/assets/sounds or affiliation language; retain the MSN-era social feel using original K-ssenger identity.

## Remaining Premium V1 release gates

1. Controlled live apply/verification of `0019_account_delete_fk_semantics.sql`, then disposable in-app delete proof including failed sign-in afterward.
2. Real two-physical-device Android Signal proof through the production server: discovery/prekey claim, identity continuity, ratchet continuity, revocation and reconnect.
3. Physical Android validation of avatar/chat/K-Feed/Moments media, push delivery and K-MAP GPS permission flows.
4. Final Alice/Bob/Charlie physical smoke covering contacts, presence, K-Pulse, direct chat, offline/reconnect, receipts, groups, media, push, K-Feed, Moments, K-MAP, block/export/delete.
5. Implement and prove vetted native iOS LibSignalClient parity; repeat physical media/push/K-MAP validation on iOS.
6. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

Green CI/emulator tests, management-API deletion, iOS prebuild or an internal APK alone are not a production-E2EE declaration. Keep PR #2 draft until the critical live-database and physical-device/security proofs are complete.
