# K-ssenger Project State

Last verified: 2026-09-23

Canonical current state for `kenams/K-messenger2026`. `PROJECT_STATE.md` at repository root is only a pointer.

## Repository / release

- Active branch: `feature/device-linking-scaffold`.
- HEAD: `df9b03a528cd2cf2ae2590f6712081b40e728721` — "feat(groups): real end-to-end encryption for group messages".
- Last public release: `v2.0.0-beta.9` (2026-09-12), marked `Latest` on GitHub Releases. HEAD is well beyond it (real E2EE direct+groups, delete-for-everyone, real browser push, buddy-list activity sort, FCM push, attention badges) and has not been published as a release or validated on physical devices yet.

## Messaging transport — current reality (superseded 2026-09-22)

- **Direct messages are now real end-to-end encrypted.** Each account has a persistent X25519 identity keypair (tweetnacl), private key generated on-device and never leaving it (SecureStore/localStorage), public key in `profiles.e2e_public_key`. Messages between two users who both have a public key are sealed client-side with `nacl.box` before sending; server only stores/relays the opaque `{ciphertext, nonce}` blob under algorithm `kssenger-nacl-box-v1`. Commit `e1c5e5b`, code in `lib/e2ee.ts`.
- **Group messages are now real end-to-end encrypted too.** One random NaCl secretbox key per group, wrapped individually per member via NaCl box against the same identity keypair. New table `group_keys` (RLS: read your own wrapping only, write only as a fellow member); server only ever sees wrapped blobs + ciphertext, never the group key or plaintext. First member to open the chat generates/self-wraps the key for current members; a later-added member gets it opportunistically wrapped by any online existing member (`group:updated` → `wrapForMissingMembers`). Not a hard delivery guarantee, not a ratchet — stated honestly in-app. Commit `df9b03a`.
- Transport is TLS + E2EE now, not TLS-only plaintext. The old `kssenger-plaintext-v1` path / "chiffrement à venir" banner described in earlier versions of this doc is gone — do not assume plaintext-over-TLS is still the reality.
- The retired libsignal native stack (session/prekey/ratchet) is still not used — this is a from-scratch NaCl-based scheme, not libsignal.
- Not yet proven: real 2-physical-device E2EE round-trip test (see Next steps).

## Push notifications

- Android push token: native FCM device token (`Notifications.getDevicePushTokenAsync()`), not an Expo push token — no EAS project ID dependency.
- Delivery: server mints its own OAuth2 access token from a Firebase service account (JWT bearer grant, `jose`) and calls the FCM HTTP v1 API directly (`apps/server/src/push.ts`). This bypasses Expo's hosted push relay entirely, since uploading FCM credentials via `eas credentials` has no non-interactive/CI path.
- `apps/mobile/google-services.json` is committed and wired via `app.json` → `expo.android.googleServicesFile`.
- `FCM_SERVICE_ACCOUNT_JSON` is set on the Render `kssenger-server` service. The repo alone cannot prove the secret is valid there or that a physically closed/backgrounded app actually receives a push — that requires the physical-device test below.
- iOS push is not implemented (no APNs path); no iOS build is distributed yet.

## Contacts attention UI (new)

- `apps/mobile/src/features/attention/contactAttention.ts`: lightweight client-side store fed by `message:new`/`kpulse:receive`.
- Contacts list shows a numeric unread badge per contact and an unacknowledged-K-Pulse marker, with a blinking avatar (respects reduced-motion) until that contact's chat is opened.
- Direct-message only by design; a group message's sender who is also a 1:1 contact can badge them without a real new DM existing (accepted trade-off, not a bug to chase).

## Other active surfaces

- Real email/password Neon Auth registration, login and persisted session, revalidated on app foreground.
- Contacts search/request/accept/decline/cancel/remove/favorite/block/unblock.
- Presence and K-Pulse/Wizz.
- Direct conversations (real E2EE transport, see above) with delivery/read receipts and reconnect history sync, plus delete-for-everyone on both direct and group messages.
- Groups: create/invite/remove/roles/leave/ownership transfer, mute/ban/unban, moderator ban listing; block-aware creation/invitation; real E2EE (see above).
- Private chat media with authorization-aware signed upload/download.
- K-Feed vertical video, Moments, K-MAP (foreground-only location, explicit opt-in, revoke/Ghost Mode).
- **K-Live**: real-time audio/video broadcast via LiveKit Cloud — "K-Live" button on the Moi screen to go live, app-wide banner for contacts to join as viewer (`live:start/join/stop` sockets). No 1:1 voice/video call and no voice-message recording exist — this is one-to-many live streaming only. Commit `5d1b155`.
- Real browser push notifications (Web Push) on web, no tab required. Commit `7126543`.
- Buddy-list sort persists activity order across app restarts. Commit `fb4c888`.
- Last.fm now-playing sync is active (`profiles.lastfm_username`, server-side, not per-device).
- Account export and account deletion (password reauthentication, exact confirmation, hard-scoped Neon deletion).
- Real sign-out (not just account deletion): "Se déconnecter" on the profile edit screen, session-only, local E2EE keys untouched. Commit `2fe8f51`.

## Dedicated backend only

- Neon project: `late-flower-65059830` (`K-ssenger`) only.
- Database: `kssenger`, PostgreSQL 17, `aws-eu-central-1`.
- Managed Neon Better Auth + Neon Data API are the active backend.
- Realtime identity comes only from verified Neon Auth JWT `sub`.
- Mobile builds contain only public K-ssenger service endpoints; server/database/provider secrets are forbidden from the mobile surface.
- No other Neon project/database may be modified.

## Security invariants (still in force)

- Never log plaintext, auth tokens, private keys or session records.
- Never expose database/provider secrets in mobile builds.
- Android platform backup must remain disabled and cleartext network traffic must remain forbidden.
- K-MAP must remain foreground-only: Android must explicitly block `ACCESS_BACKGROUND_LOCATION`; no hidden permanent/background tracking.
- Push data is allow-listed metadata only (see `assertMetadataOnlyPushPayload` in `apps/server/src/push.ts`).
- Blocking must not be bypassable through direct chat, group creation/invitation, presence, K-Pulse or K-MAP.
- The server must reject any Neon Auth base/JWKS/audience value other than the dedicated K-ssenger branch values.
- K-ssenger is independent from Microsoft and must not ship Microsoft branding/assets/sounds or affiliation language.

## Next steps (validated order — do not skip ahead)

1. Physical-device validation of a HEAD-built APK on Kenams' own phone: login, contacts, DM, K-Pulse, media, Last.fm, and push with the app open / backgrounded / fully closed.
2. Same APK on a second physical phone (a real contact): add contact → DM both directions **including a real E2EE round-trip check** (message unreadable to a server-side inspection, readable on both devices) → delivery → read receipts → K-Pulse → push notifications → close/reopen → reconnect → repeat the E2EE check inside a group with 2+ members.
3. Fix only what those two tests actually surface.
4. Publish a clean new beta release and point any "latest"/stable link at it.
5. Only after 1–4 are green: iOS, then the home-screen widget, then K-Map v2.
