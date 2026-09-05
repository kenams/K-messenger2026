# K-ssenger Project State

Last verified: 2026-09-05

This is the canonical project state file. Keep `PROJECT_STATE.md` at the repository root as a pointer only.

## Repository

- Repository: `kenams/K-messenger2026`.
- Active branch: `fix/feed-kmap-contact-security`.
- Base: `bootstrap/platform`.
- PR #2 `Security hardening + messaging reliability`: OPEN and DRAFT. Keep it draft while the real-device/security gates below remain open.
- Never force-push.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Branch: `br-falling-sea-b1k36u32` / `main`.
- Database: `kssenger`.
- Region: `aws-eu-central-1`, PostgreSQL 17.
- Neon Auth is the managed Better Auth integration on this branch; the live schema is the current `neon_auth.user/account/session/...` layout.
- Neon Data API is active for the dedicated K-ssenger backend.
- Runtime Supabase assumptions are retired; historical migration references are not an active backend.
- CI fails if Supabase packages, environment variables or hosted endpoints are reintroduced under active `apps/` or `packages/` runtime sources.
- CI fails if server/database credentials or secret-like `EXPO_PUBLIC_*` variables enter the mobile source/config surface.
- Mobile Neon configuration fails closed unless both public endpoints are exact HTTPS K-ssenger endpoints with no embedded URL credentials, query parameters or fragments.
- No other project/database is allowed to be modified.

## Latest verified delivery state

- `09c29394e93e6b8881fbed91ea4ed7e22d945f72` wired private avatar upload/edit and authorization-aware downloads.
- On that commit, CI #411, Remote Social Smoke #65, Remote V1 Smoke #10, Android Internal APK #109 and Android E2EE Runtime #52 all completed successfully.
- Android Internal APK #109 produced the standalone internal release artifact with the dedicated K-ssenger Neon/Auth/Data API and Render realtime endpoints.
- `9ab1109248f12db3b188e084087548b28c1ca19a` extended authorized private-avatar rendering to contacts/search surfaces with signed short-lived downloads and initials fallback when access is not authorized.
- `027854edf702a8f7e98a56fed67731d695b61013` makes realtime startup wait for an authenticated Socket.IO connection and rejects request/ack commands while disconnected instead of allowing timed-out commands to execute later from Socket.IO's buffer.
- `419aa3033e76995dc1e5164e1a164d665b689b7d` adds a CI regression contract for private chat media: downloads remain authorization-aware, uploads remain bound to the active conversation, and the Signal envelope carries only the private media reference rather than a stored public URL.
- `54abd0b58e62d431a34a3bb3e70f69b1974e35b3` is verified GREEN in CI #446 and Android E2EE Runtime #91.
- `9a740b8f3d55991fc94e416ab1bbc392eb8445fd` adds the Neon-only runtime regression scanner; `e947e71aac878d957815539a9a52bf758830dc97` wires it into mandatory CI.
- `081d1933be72b268ac75ddb07a3fad6c5e48a884` is verified GREEN in CI #449 and Android E2EE Runtime #94.
- `3800b783fbbe62e59c6840d30229985c3d829963` adds a mobile secret-surface scanner; `c1a82f13cded7c3e73a0358c1ef6eb5df661e51e` makes it mandatory in CI.
- `5b6c7d1feb894a833ea9c6cfe4b7c81301ef173a` is verified GREEN in CI #452 and Android E2EE Runtime #97.
- `aa096581717632dac080f2ecf2c0130a46e12a7b` hardens the mobile dedicated-Neon runtime check so malformed/non-HTTPS URLs and URLs containing credentials, query parameters or fragments fail closed before client creation.
- `4fa4fb99242317cc0447c3fbf079cedda25a2050` is verified GREEN in CI #454 and Android E2EE Runtime #99.
- `92c35c8bc2b72fafa8accf5129334005a618e434` adds repository migration `0018_contact_removal_revokes_kmap_shares.sql`.
- `3d74c4b7c2a39f037cc6256f04846a3a1b09c6a0` extends the Neon social RLS integration suite so contact-removal K-MAP revocation is a mandatory regression contract.
- `202e2ac0f995d89bd5f716a99e61b8bc97560347` hardens private-media presigned requests on mobile: non-HTTPS URLs, URL credentials, wrong methods and expired/near-expired signatures fail before fetch.
- `fdebc26f087f73429b9e3c4ae902ea6e5731d68a` locks that signed-media behavior into the mandatory client regression suite; CI #460 is GREEN.
- `9d19a045d4948e86cf45a62b6fb44ed78ec89db3` hardens migration `0018` so its `SECURITY DEFINER` trigger function explicitly revokes execution from both `PUBLIC` and `authenticated`.
- `fd9d3e7db064d1a3eb4d356b764ec522b7a52f2e` adds a CI contract preventing that trigger privilege from regressing. CI #462 / Android E2EE Runtime #107 are queued at this verification point.

## Live Neon surface

The dedicated live database remains the only allowed backend.

Direct inspection on 2026-09-05 confirms:
- all 26 public tables have RLS enabled;
- FORCE RLS is enabled on `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims`, `media_objects` and `push_subscriptions`;
- `revoke_location_on_block` is installed on `blocks`;
- `revoke_location_on_contact_removal` is now installed on `contacts` and invokes `public.revoke_location_shares_on_contact_removal()`;
- the contact-removal trigger function is `SECURITY DEFINER` with a fixed `search_path` and its live ACL is owner-only (`kssenger_owner`); `authenticated` no longer has direct execute permission;
- contact/shared-group Signal device discovery and `claim_signal_prekey_bundle(uuid)` remain fail-closed and block-aware.

The current Neon Auth integration is Better Auth on branch `br-falling-sea-b1k36u32`. A disposable failed self-delete smoke account was deleted through the current branch-scoped Neon Auth management API and verified absent from `neon_auth.user`. This proves the previous management-provider 404 is no longer a platform-wide blocker; the in-app authenticated delete path still requires a fresh end-to-end disposable-account proof before release.

## Operational V1 modules

- Real Neon Auth email/password registration, login and persisted session.
- Profile bootstrap, username, display name, status, bio, music and private avatar media.
- Contacts search/request/accept/decline/cancel/remove/favorite/block/unblock.
- Authenticated realtime presence and K-Pulse/Wizz behavior.
- Direct conversations with native-libsignal encrypted multi-device envelopes, delivery/read receipts and reconnect history synchronization. No plaintext transport fallback.
- Groups with create/invite/remove/roles/leave/ownership transfer plus mute/ban/unban and moderator ban listing.
- K-Feed vertical video backed by real Neon rows and verified private media.
- Moments backed by real expiring Neon rows and verified private photo/video media.
- K-MAP with explicit foreground permission, approximate/precise sharing, recipient controls, revoke, Ghost Mode, block-time revocation and contact-removal revocation at the database boundary.
- Native push registration and metadata-only server push payloads.
- Account export v3.
- Account deletion UI/server route with password reauthentication, fresh Neon token and provider scope hard-coded to the dedicated K-ssenger project/branch. The provider management API is currently functional; end-to-end in-app deletion proof is still pending.
- Media prepare/upload/complete/download handlers are registered in the real server path. The nested Object Storage presign key 404 bug is fixed and regression-covered.
- Chat media client behavior is regression-covered so authorized private downloads and conversation-scoped uploads cannot silently regress to public URLs.
- Mobile private-media requests validate signed request protocol, credentials, method and expiry before touching the network.

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

1. Real two-physical-device Android Signal proof through the production server: discovery/prekey claim, identity continuity, ratchet continuity, revocation and reconnect.
2. Physical Android validation of avatar/chat/K-Feed/Moments media, push delivery and K-MAP GPS permission flows; repeat on iOS once native parity exists.
3. Live-prove the in-app account deletion flow with a fresh disposable password-authenticated account, including failed sign-in after deletion.
4. Validate final Alice/Bob/Charlie physical smoke: contacts, presence, K-Pulse, direct chat, offline/reconnect, receipts, groups, media, push, K-Feed, Moments, K-MAP, block/export/delete.
5. Implement and prove vetted native iOS libsignal parity.
6. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

An emulator test, green CI, management-API deletion or an APK assembly alone is not a production-E2EE declaration. Keep PR #2 draft until the critical physical-device/security gates are proven. Android internal builds may continue to be produced for real-device validation.
