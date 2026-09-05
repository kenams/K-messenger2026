# K-ssenger Project State

Last verified: 2026-09-05

This is the canonical project state file. Keep `PROJECT_STATE.md` at the repository root as a pointer only.

## Repository

- Repository: `kenams/K-messenger2026`.
- Active branch: `fix/feed-kmap-contact-security`.
- Base: `bootstrap/platform`.
- PR #2 `Security hardening + messaging reliability`: OPEN, DRAFT and mergeable.
- Never force-push. Keep the PR draft while the real-device/security gates below remain open.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Branch: `br-falling-sea-b1k36u32` / `main`.
- Database: `kssenger`.
- Region: `aws-eu-central-1`, PostgreSQL 17.
- Better Auth and Neon Data API are active for the dedicated K-ssenger backend.
- Runtime Supabase assumptions are retired; historical migration references are not an active backend.
- No other project/database is allowed to be modified.

## Latest verified delivery state

- `09c29394e93e6b8881fbed91ea4ed7e22d945f72` wired private avatar upload/edit and authorization-aware downloads.
- On that commit, CI #411, Remote Social Smoke #65, Remote V1 Smoke #10, Android Internal APK #109 and Android E2EE Runtime #52 all completed successfully.
- Android Internal APK #109 produced the standalone internal release artifact with the dedicated K-ssenger Neon/Auth/Data API and Render realtime endpoints.
- `9ab1109248f12db3b188e084087548b28c1ca19a` extended authorized private-avatar rendering to contacts/search surfaces with signed short-lived downloads and initials fallback when access is not authorized. CI #412 is GREEN; Android validations are being re-run on the moving branch head.
- `027854edf702a8f7e98a56fed67731d695b61013` makes realtime startup wait for an authenticated Socket.IO connection and rejects request/ack commands while disconnected instead of allowing timed-out commands to execute later from Socket.IO's buffer. This prevents ghost duplicate contact/K-Pulse/message actions after reconnect.
- `419aa3033e76995dc1e5164e1a164d665b689b7d` adds a CI regression contract for private chat media: downloads must stay authorization-aware, uploads remain bound to the active conversation, and the Signal envelope carries only the private media reference rather than a stored public URL.

## Live Neon surface

Repository/live migrations are verified through `0016_signal_group_prekey_claim.sql`.

The live V1 surface includes profiles/privacy, contacts/blocks, conversations/messages/receipts, group membership/moderation, K-Feed, Moments, K-MAP, push subscriptions, private media metadata and Signal device bundles/prekeys with FORCE RLS. Contact/shared-group Signal device discovery and `claim_signal_prekey_bundle(uuid)` are fail-closed and block-aware.

## Operational V1 modules

- Real Neon Auth email/password registration, login and persisted session.
- Profile bootstrap, username, display name, status, bio, music and private avatar media.
- Contacts search/request/accept/decline/cancel/remove/favorite/block/unblock.
- Authenticated realtime presence and K-Pulse.
- Direct conversations with native-libsignal encrypted multi-device envelopes, delivery/read receipts and reconnect history synchronization. No plaintext transport fallback.
- Groups with create/invite/remove/roles/leave/ownership transfer plus mute/ban/unban and moderator ban listing.
- K-Feed vertical video backed by real Neon rows and verified private media.
- Moments backed by real expiring Neon rows and verified private photo/video media.
- K-MAP with explicit foreground permission, approximate/precise sharing, recipient controls, revoke and Ghost Mode.
- Native push registration and metadata-only server push payloads.
- Account export v3.
- Account deletion UI/server route with password reauthentication, fresh Neon token and provider scope hard-coded to the dedicated K-ssenger project/branch. Provider deletion remains externally blocked by `ACCOUNT_DELETE_PROVIDER_404`; do not weaken auth to bypass it.
- Media prepare/upload/complete/download handlers are registered in the real server path. The nested Object Storage presign key 404 bug is fixed and regression-covered.
- Chat media client behavior is regression-covered so authorized private downloads and conversation-scoped uploads cannot silently regress to public URLs.

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
- K-ssenger is independent from Microsoft and must not use Microsoft branding/assets/sounds or affiliation language.

## Remaining Premium V1 release gates

1. Real two-physical-device Android Signal proof through the production server: discovery/prekey claim, identity continuity, ratchet continuity, revocation and reconnect.
2. Finish and physically validate chat media UX; private chat storage is already available, but every send/render path must remain authorization-aware and must not expose a public media URL.
3. Validate avatar/K-Feed/Moments media, push delivery and K-MAP GPS permission flows on physical Android; repeat on iOS once native parity exists.
4. Resolve external Neon `ACCOUNT_DELETE_PROVIDER_404`, then live-prove in-app self-delete with a disposable password-authenticated account.
5. Validate final Alice/Bob/Charlie physical smoke: contacts, presence, K-Pulse, direct chat, offline/reconnect, receipts, groups, media, push, K-Feed, Moments, K-MAP, block/export/delete.
6. Implement and prove vetted native iOS libsignal parity.
7. Produce store-signed Android/iOS builds when signing credentials/tooling are available.

## Release rule

An emulator test, green CI or an APK assembly alone is not a production-E2EE declaration. Keep PR #2 draft until critical physical-device/security gates are proven. Android internal builds may continue to be produced for real-device validation.
