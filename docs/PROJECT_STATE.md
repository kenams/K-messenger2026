# K-ssenger Project State

Last verified: 2026-09-06

Canonical current state for `kenams/K-messenger2026`. The root `PROJECT_STATE.md` is only a pointer.

## Repository / release

- Active release-hardening branch: `release/v1-hardening`, based on `bootstrap/platform`.
- PR #2 was merged into `bootstrap/platform` on 2026-09-06 before the physical-device/E2EE/store gates were complete. History was not rewritten.
- PR #4 `V1 release hardening and physical-validation gates` is OPEN, DRAFT and mergeable. Keep it draft until the critical gates below are proven.
- Product candidate remains V1 `1.0.0`: Expo app version `1.0.0`, iOS build `1`, Android versionCode `1`, stable `com.kahdigital.kssenger` identifiers.
- Merged PR #2 head `84144a6999d41b9504ac93a7eca940cd6536bceb` is fully green: CI #566, Android E2EE Runtime #217 and iOS Native Prebuild #85.
- The web React runtime crash found after PR #2 was isolated to duplicate React/ReactDOM versions. The verified fix pins both to `19.1.0` with npm overrides and was merged into `release/v1-hardening` through PR #3 after CI #568, Android E2EE Runtime #219 and iOS Native Prebuild #87 passed.
- The static release gate now requires the root React and ReactDOM overrides to exactly match the mobile runtime dependencies, preventing future dependency drift from silently reintroducing the invalid-hook-call/blank-screen failure.
- Release CI now runs directly on `release/v1-hardening`; Android internal APK, Android E2EE runtime and iOS native-prebuild workflows no longer depend on the retired `fix/feed-kmap-contact-security` push branch.
- Android internal APK artifacts are release-mode APKs with generated manifest hardening checks, pinned official libsignal dependencies and SHA-256 integrity manifests. Store signing remains a separate gate.
- Remote V1 Smoke #28 remains GREEN with 30/30 Alice/Bob/Charlie application-path checks.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Branch: `br-falling-sea-b1k36u32` / `main`.
- Database: `kssenger`, PostgreSQL 17, `aws-eu-central-1`.
- Managed Neon Auth + Neon Data API are the active backend. Runtime Supabase assumptions are retired and CI rejects their reintroduction.
- Realtime identity comes only from verified Neon Auth JWT `sub`.
- Server startup is pinned to the exact K-ssenger Neon Auth base URL, JWKS URL and audience and fails closed on backend drift.
- Mobile builds contain only public K-ssenger service endpoints; database/provider/server secrets are forbidden from the mobile surface.
- No other Neon project/database may be modified.

## Live Neon security state

- All 26 public tables have RLS enabled.
- FORCE RLS remains enabled on `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims`, `media_objects` and `push_subscriptions`.
- K-MAP block and contact-removal revocation triggers are installed live. The contact-removal `SECURITY DEFINER` function keeps a fixed search path and owner-only execution ACL.
- `0019_account_delete_fk_semantics.sql` is now LIVE on the dedicated K-ssenger database and matches the repository migration:
  - `conversations.created_by` is nullable with `ON DELETE SET NULL`.
  - `group_bans.banned_by` is nullable with `ON DELETE SET NULL`.
  - `messages.sender_user_id` remains non-null with `ON DELETE CASCADE`.
- The database migration gate is therefore no longer the blocker for account deletion. The remaining deletion gate is a disposable real in-app delete proof followed by failed sign-in verification.

## Operational Premium V1 surface

- Real email/password Neon Auth registration, login and persisted session with foreground revalidation, stale-refresh race protection and offline-safe preservation.
- Username, display name, status, bio/music and authorization-aware private avatar media.
- Contacts search/request/accept/decline/cancel/remove/favorite/block/unblock.
- Authenticated presence and K-Pulse/Wizz behavior.
- Direct conversations with native-libsignal multi-device envelopes on Android, delivery/read receipts and reconnect history synchronization; no plaintext transport fallback.
- Groups with create/invite/remove/roles/leave/ownership transfer, mute/ban/unban and moderator ban listing. Blocked participant combinations are rejected at creation and later invite time.
- Private chat media with authorization-aware signed upload/download and strict signed-request validation.
- K-Feed vertical video with private media backing, age gating, sensitive-content warning and moderation reporting.
- Moments with real expiring rows, private photo/video media, visibility and moderation/reporting controls.
- K-MAP with explicit foreground permission, approximate/precise modes, recipient controls, revoke/Ghost Mode and database-boundary revocation on block/contact removal. Android background-location permission is explicitly blocked and iOS always-location declarations are forbidden.
- Native push registration with metadata-only server payloads; sensitive push fields are rejected before recipient/provider delivery and sign-out revokes push state first.
- Account export v3.
- Account deletion UI/server path requires password reauthentication, exact confirmation, a fresh Neon token and hard-scoped K-ssenger Neon management deletion. Android additionally purges account-scoped native Signal material and destroys the Keystore key after server success.
- Android release config disables backup and cleartext networking. iOS ATS forbids arbitrary/local-network exceptions. Native permission disclosures are explicit for location, photo library, camera and user-initiated microphone use.
- Expo V1 explicitly uses Hermes.
- Web runtime uses one pinned React/ReactDOM version tree, and the release gate enforces alignment with mobile React dependencies to prevent the previously observed invalid-hook-call blank screen.

## E2EE

- No custom cryptography.
- Official `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned.
- Android native Session/Identity/PreKey/SignedPreKey/KyberPreKey stores persist behind Android Keystore protected storage.
- Emulator proof is green for PQXDH/prekey establishment, one-time EC/PQ consumption, first PreKeySignalMessage, SignalMessage reply, Double Ratchet continuity and native-store recreation.
- Android release packaging strips desktop JNI artifacts and verifies the real Android `libsignal_jni.so` is present.
- Direct/group composers fail closed if native E2EE readiness is not proven.
- Production E2EE is NOT claimed until a real two-physical-device server-mediated proof passes.
- iOS native project generation works, but vetted native LibSignalClient parity is not implemented; iOS E2EE remains deliberately fail-closed.

## Security invariants

- Never weaken RLS/authorization to unblock UX.
- Never log plaintext, auth tokens, private keys or Signal session records.
- Never invent cryptography or advertise production E2EE without physical-device proof.
- Never expose database/provider secrets in mobile builds.
- Android backup and cleartext traffic must remain disabled.
- Root React/ReactDOM overrides must remain aligned to the mobile runtime so web cannot ship a duplicate React tree.
- K-MAP must remain foreground-only; no hidden or permanent tracking.
- Push data remains allow-listed metadata only.
- Blocking must not be bypassable through direct chat, groups, presence, K-Pulse or K-MAP.
- Realtime rate limiting remains bounded and fail-closed.
- Persisted mobile auth must be foreground-revalidated without stale async overwrite or false offline logout.
- Account deletion must not leave account-scoped Signal secrets recoverable on the deleting Android device.
- K-ssenger is independent from Microsoft and must not ship Microsoft branding/assets/sounds or affiliation language; preserve the MSN-era social feel using original K-ssenger identity.

## Remaining Premium V1 release gates

1. Disposable in-app account deletion proof against live `0019`, including failed sign-in afterward and local Signal-secret purge verification.
2. Real two-physical-device Android Signal proof through the production server: discovery/prekey claim, identity continuity, ratchet continuity, revocation and reconnect.
3. Physical Android validation of avatar/chat/K-Feed/Moments media, push delivery and K-MAP GPS permission flows.
4. Final Alice/Bob/Charlie physical smoke covering contacts, presence, K-Pulse, direct chat, offline/reconnect, receipts, groups, media, push, K-Feed, Moments, K-MAP, block/export/delete.
5. Implement and prove vetted native iOS LibSignalClient parity; repeat physical media/push/K-MAP validation on iOS.
6. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

Green CI/emulator tests, management-API deletion, web rendering, iOS prebuild or an internal APK alone are not a production-E2EE declaration. Keep PR #4 draft until the critical physical-device/security/store gates are complete.
