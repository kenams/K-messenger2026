# K-ssenger Project State

Last verified: 2026-09-14

Canonical current state for `kenams/K-messenger2026`. `PROJECT_STATE.md` at repository root is only a pointer.

## Repository / release

- Active branch: `feature/device-linking-scaffold`.
- HEAD: `36395d3b01e858a1dd33035e3e503a16d859d93b` — "feat(contacts): badge unread DMs and blink contacts with unacknowledged K-Pulse".
- Last public release: `v2.0.0-beta.9` (2026-09-12), marked `Latest` on GitHub Releases.
- HEAD has not been published as a release yet. It carries changes beyond `beta.9`: direct FCM HTTP v1 push delivery, and unread/K-Pulse attention badges in the contacts list. An APK built from this exact commit exists but has not been validated on physical devices and must not be promoted to any "latest"/stable link until that validation passes.

## Messaging transport — current reality

- Chat transport identifier: `kssenger-plaintext-v1`.
- **End-to-end encryption is NOT implemented today.** Direct and group conversation screens call `encodePlaintext()` on send and display "Connexion sécurisée. Le chiffrement de bout en bout sera ajouté dans une prochaine version." in the UI itself.
- Transport is protected by TLS only (server ↔ client), not E2EE.
- The previously pinned `org.signal:libsignal-client`/`org.signal:libsignal-android` native stack and all libsignal session/prekey/ratchet machinery described in earlier versions of this document have been retired from the current runtime. Do not assume any libsignal code path is active.
- E2EE is planned for a later phase, not before the Android messaging flow itself is proven stable on physical devices.

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
- Direct conversations (plaintext transport, see above) with delivery/read receipts and reconnect history sync.
- Groups: create/invite/remove/roles/leave/ownership transfer, mute/ban/unban, moderator ban listing; block-aware creation/invitation.
- Private chat media with authorization-aware signed upload/download.
- K-Feed vertical video, Moments, K-MAP (foreground-only location, explicit opt-in, revoke/Ghost Mode).
- Last.fm now-playing sync is active (`profiles.lastfm_username`, server-side, not per-device).
- Account export and account deletion (password reauthentication, exact confirmation, hard-scoped Neon deletion).

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

1. Physical-device validation of the `36395d3b` APK on Kenams' own phone: login, contacts, DM, K-Pulse, media, Last.fm, and push with the app open / backgrounded / fully closed.
2. Same APK on a second physical phone (a real contact): add contact → DM both directions → delivery → read receipts → K-Pulse → push notifications → close/reopen → reconnect. This is a real two-device messaging test, **not** an E2EE test.
3. Fix only what those two tests actually surface.
4. Publish a clean new beta release and point any "latest"/stable link at it.
5. Only after 1–4 are green: iOS, then the home-screen widget, then K-Map v2. E2EE work is a separate, later phase and must not be assumed or advertised as present before then.
