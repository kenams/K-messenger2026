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
- Head `56a6069ec851af329f05caeec4d6e102a1d40941` is fully GREEN: CI #543, Android E2EE Runtime #191 and iOS Native Prebuild #62 all completed successfully.
- `f469f1b7e2ab9ef5f78fff97a253fdf669835414` adds managed Neon Auth session revalidation whenever the mobile app returns to the foreground, with refresh sequencing so an older async `getSession()` result cannot overwrite a newer auth event.
- `98db71fa40d88bda52cf01766d98498e430fb099` makes that foreground revalidation offline-safe: transient transport failure preserves the existing persisted session instead of falsely logging the user out, while confirmed no-session/revocation still clears it.
- `3d55f3d168a5a5a48ceaeecc8637e62d22b6dd71` locks foreground revalidation, stale-refresh race protection, offline-session preservation and listener cleanup in CI.
- `f3d4a0dc8f217d3bcca7b84a8b4742810944dc6b` disables Android application backup in the release configuration so account/session-sensitive app data is not included in platform backup/restore flows.
- `be629b9d2c496c333a07fa5ff9697ac1cd5fc614` makes `allowBackup: false` a mandatory static release-gate invariant.
- `f0f193c1383bead5cb77cb6432856e1b65e9729a` explicitly hardens iOS App Transport Security: arbitrary network loads and local-network exemptions are disabled in the release Info.plist configuration.
- `d0d15d3595fe173cdec233b90639863814c301d7` makes those iOS ATS settings mandatory release-gate invariants so a future configuration drift cannot silently re-enable insecure transport exceptions.
- `c2410aaeb33e89e373841ea04862efd9d8d187e1` adds a native Android manifest policy through the K-ssenger Expo config plugin that forces `android:usesCleartextTraffic="false"`.
- `414a0789a3777020715fdb52a845f7653c41a796` removes an unsupported direct Expo config shortcut so the policy is applied only through the native manifest plugin rather than relying on an ignored field.
- `540f30112dbe94a743a5b98fb8a3aa3156c4e399` makes the no-cleartext native policy part of the static release gate.
- `a48a1ca0fe8d987815bed51fec0faf3640940aa9` extends Android CI to trigger on app/plugin release-security changes and verifies the generated AndroidManifest contains `usesCleartextTraffic="false"` before running libsignal instrumentation.
- `aa4bcceebd4dcf1e85086367f646c78929f0fde2` hardens the Android Internal APK delivery workflow: it verifies the generated manifest contains both `allowBackup="false"` and `usesCleartextTraffic="false"`, generates a SHA-256 checksum for the final release APK, verifies that checksum immediately, and uploads the APK plus checksum together as one artifact.
- `638bda49511a830b6fa37322386077614440b522` makes the realtime server fail closed unless `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` are exactly the public endpoints of the dedicated K-ssenger Neon Auth branch.
- `0b4f9e494283ec16ed319f73139b83a1240fc79e` aligns the server environment template with those exact public K-ssenger Auth/JWKS endpoints, reducing deployment drift without exposing any credential.
- `7e4857c030a9a532b8b85edda7042669fcb9de24` extends the mandatory static release gate to verify the server-side dedicated Neon Auth/JWKS pinning cannot silently regress.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Branch: `br-falling-sea-b1k36u32` / `main`.
- Database: `kssenger`, PostgreSQL 17, `aws-eu-central-1`.
- Managed Neon Better Auth + Neon Data API are the active backend. Runtime Supabase assumptions are retired and CI rejects their reintroduction.
- Realtime identity comes only from verified Neon Auth JWT `sub`.
- Mobile builds contain only public K-ssenger service endpoints; server/database/provider secrets are forbidden from the mobile surface.
- Server startup is now pinned to the exact public Auth/JWKS endpoints of the dedicated K-ssenger Neon branch and fails closed on backend drift.
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
- K-MAP with explicit foreground permission, approximate/precise modes, recipient controls, revoke/Ghost Mode and database-boundary revocation on block/contact removal.
- Native push registration with metadata-only server payloads. Sensitive push fields are rejected before recipient lookup/provider delivery; sign-out revokes push state before ending auth session.
- Account export v3.
- Account deletion UI/server path requires password reauthentication, exact confirmation, fresh Neon token and hard-scoped Neon K-ssenger management deletion. Full in-app disposable proof waits on live `0019`. Android additionally purges deleted-account native Signal material and destroys its Keystore key after server success.
- Android release configuration disables platform backup and explicitly forbids cleartext network traffic; both are enforced by release/Android CI gates. Internal APK artifacts now ship with a verified SHA-256 manifest for integrity checks.
- iOS release configuration explicitly forbids arbitrary ATS loads and local-network exemptions; the static release gate enforces both settings.

## E2EE

- No custom cryptography.
- Official `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned.
- Android native Session/Identity/PreKey/SignedPreKey/KyberPreKey stores persist behind Android Keystore protected storage.
- Android emulator runtime proof is GREEN for PQXDH/prekey establishment, one-time EC/PQ consumption, first PreKeySignalMessage, SignalMessage reply, Double Ratchet continuity and native-store recreation.
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
- The server must reject any Neon Auth/JWKS endpoint other than the dedicated K-ssenger branch endpoints.
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
