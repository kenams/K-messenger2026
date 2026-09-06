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
- Head `acf650f6be815891469b3dfdc1419576246c428d` is fully GREEN: CI #503, Android E2EE Runtime #148 and iOS Native Prebuild #22 all completed successfully.
- `d2cfb8fde430e4e1f637a4954caa76d80bde157b` adds a mandatory server regression contract tying repository migration `0019` and the live release-readiness gate to the exact account-deletion FK semantics required for V1.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Branch: `br-falling-sea-b1k36u32` / `main`.
- Database: `kssenger`, PostgreSQL 17, `aws-eu-central-1`.
- Managed Neon Better Auth + Neon Data API are the active backend. Runtime Supabase assumptions are retired and CI rejects their reintroduction.
- Realtime identity comes only from verified Neon Auth JWT `sub`.
- Mobile builds contain only public K-ssenger service endpoints; server/database/provider secrets are forbidden from the mobile surface.
- No other Neon project/database may be modified.

## Live Neon security state

- All 26 public tables have RLS enabled.
- FORCE RLS remains enabled on `device_key_bundles`, `device_one_time_prekeys`, `device_pq_one_time_prekeys`, `device_prekey_claims`, `media_objects` and `push_subscriptions`.
- K-MAP block and contact-removal revocation triggers are installed live. The contact-removal `SECURITY DEFINER` function has a fixed search path and owner-only execution ACL.
- Fresh inspection on 2026-09-06 previously confirmed exactly 29 public foreign keys target `neon_auth.user`. Internal `neon_auth` tables are provider-owned and are not part of the application FK release surface.
- Exactly three public FKs remain deletion-blocking `NO ACTION`: `conversations_created_by_fkey`, `messages_sender_user_id_fkey`, `group_bans_banned_by_fkey`. Every other public reference is already `CASCADE` or `SET NULL`.
- Repository migration `0019_account_delete_fk_semantics.sql` changes those three to the intended deletion-safe semantics.
- A controlled Neon temporary-branch dry-run on 2026-09-06 verified the migration schema diff exactly: `conversations.created_by` and `group_bans.banned_by` become nullable with `ON DELETE SET NULL`; `messages.sender_user_id` stays non-null and becomes `ON DELETE CASCADE`. The temporary validation branches were deleted afterward and production remained unchanged.
- `npm run release:check-neon-live` intentionally fails until `0019` is applied live.

## Operational Premium V1 surface

- Real email/password Neon Auth registration, login and persisted session.
- Username, display name, status, bio/music and authorization-aware private avatar media.
- Contacts search/request/accept/decline/cancel/remove/favorite/block/unblock.
- Authenticated presence and K-Pulse/Wizz behavior.
- Direct conversations with native-libsignal multi-device envelopes, delivery/read receipts and reconnect history synchronization; no plaintext transport fallback.
- Groups with create/invite/remove/roles/leave/ownership transfer, mute/ban/unban and moderator ban listing.
- Private chat media with authorization-aware signed upload/download and strict signed-request validation.
- K-Feed vertical video with private media backing, age gating, sensitive-content warning and moderation reporting.
- Moments with real expiring rows, private photo/video media, visibility and moderation/reporting controls.
- K-MAP with explicit foreground permission, approximate/precise modes, recipient controls, revoke/Ghost Mode and database-boundary revocation on block/contact removal.
- Native push registration with metadata-only server payloads. Sensitive push fields are rejected before recipient lookup/provider delivery; sign-out revokes push state before ending auth session.
- Account export v3.
- Account deletion UI/server path requires password reauthentication, exact confirmation, fresh Neon token and hard-scoped Neon K-ssenger management deletion. A historical disposable account has been successfully deleted via the current management API; full in-app disposable proof waits on live `0019`.
- Static release gate locks version/store identifiers, dedicated Neon endpoints, HTTPS-only public URLs, no Supabase/secret markers and iOS E2EE fail-closed status.

## E2EE

- No custom cryptography.
- Official `org.signal:libsignal-client:0.100.0` and `org.signal:libsignal-android:0.100.0` are pinned.
- Android native Session/Identity/PreKey/SignedPreKey/KyberPreKey stores persist behind Android Keystore protected storage.
- Android emulator runtime proof is GREEN for PQXDH/prekey establishment, one-time EC/PQ consumption, first PreKeySignalMessage, SignalMessage reply, Double Ratchet continuity and native-store recreation.
- Android release packaging strips desktop JNI artifacts and verifies the real Android `libsignal_jni.so` is present in the assembled APK.
- Direct/group composers fail closed if native E2EE readiness is not proven.
- Production E2EE is NOT claimed until a real two-physical-device server-mediated proof passes.
- iOS native project generation and V1 identity generation work, but vetted native LibSignalClient parity is not implemented; iOS E2EE remains deliberately fail-closed.
- iOS CI fail-closed validation is code-based rather than documentation-string-based.

## Security invariants

- Never weaken RLS/authorization to unblock UX.
- Never log plaintext, auth tokens, private keys or Signal session records.
- Never invent cryptography or advertise production E2EE without device proof.
- Never expose database/provider secrets in mobile builds.
- K-MAP is explicit opt-in; no hidden permanent/background tracking.
- Push data is allow-listed metadata only.
- Account deletion readiness audits the full public FK surface targeting `neon_auth.user`.
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
