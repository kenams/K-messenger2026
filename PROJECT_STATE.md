# K-ssenger Project State

Last verified: 2026-09-05
Active delivery branch: `fix/feed-kmap-contact-security`
Active PR: #2 (`Security hardening + messaging reliability`) — intentionally kept as draft while critical native/security gates remain open.

## Backend isolation

- Dedicated Neon project only: `late-flower-65059830` (`K-ssenger`).
- Region: `aws-eu-central-1`.
- Primary database: `kssenger`.
- Default Neon branch: `main` (`br-falling-sea-b1k36u32`), READY.
- Managed Neon Auth / Better Auth and the Neon Data API are the only identity/data backend for the active V1.
- Retired `supabase/` project configuration and migrations have been removed from the active branch.
- The insecure legacy plaintext `apps/web` beta path and its beta smoke workflow have also been removed from the active V1 branch.
- Neon project discovery re-verified the dedicated `K-ssenger` project as `late-flower-65059830`; no other Neon project was modified.
- No non-K-ssenger database/project was touched during this run.

## Live Neon V1 surface

The dedicated live database contains the V1 tables used by the active implementation, including:

- profile/privacy: `profiles`, `devices`, `privacy_settings`, `user_age_profile`
- contacts/safety: `contact_requests`, `contacts`, `blocks`
- messaging: `conversations`, `conversation_members`, `messages`, `message_receipts`
- moderation: `group_bans`
- social: `public_videos`, `video_reports`, `moments`, `moment_views`, `moment_reactions`, `moment_reports`
- K-MAP: `location_shares`, `location_points`
- push: `push_subscriptions`

`push_subscriptions` is verified with both RLS and FORCE RLS enabled. Repository Neon migrations currently run through `0009_push_subscriptions.sql`.

## Operational / implemented

- Real Neon Auth email/password login/session.
- Username, display name, avatar/status/bio/music profile surfaces.
- Explicit logout from the mobile account surface.
- Contacts lifecycle: search/request/accept/decline/cancel/remove/favorite/block/unblock plus blocked-user UI.
- Presence plus reconnect-safe realtime session authentication.
- K-Pulse/Wizz realtime attention interaction.
- Direct conversations with membership/block authorization, ciphertext-envelope history, delivery/read receipts and reconnect resynchronization.
- Groups with create/invite/remove/roles/leave/ownership transfer plus mute/ban/unban/moderator ban listing.
- Privacy-safe account export v3, including push-subscription metadata but explicitly excluding provider push tokens; private messages remain encrypted envelopes.
- K-Feed backed by real Neon/RLS metadata and reporting; demo rows removed.
- Moments backed by real 24-hour Neon rows for text moments, visibility/delete/report; demo rows removed.
- K-MAP backed by authorized Neon rows, recipient-safe coordinate coarsening, revoke and Ghost Mode.
- Server-side Expo push delivery for new messages: generic metadata-only notifications, no plaintext/ciphertext in push payloads, provider failure isolation, invalid-token disable handling and regression tests.

## Validation

- CI run #301 is green on head `d51a0bc0706b065109d762eb151b41568f0069f5`.
- Current head `d3cdf981ad3eac1bd51d319799ad52e1073d10a2` makes the manual remote V1 smoke reproducible with `npm ci` plus npm cache; CI for this new head remains a release gate until green.
- Real Neon social smoke passed 9/9 checks for auth/profile/age, contacts, K-MAP privacy/revoke, Moments isolation/reaction authorization, K-Feed moderation isolation and anti-forgery RLS.
- Managed Neon Auth self-service deletion was tested with a disposable account and the public delete endpoint returned HTTP 404. The disposable test accounts from that run were deleted through the K-ssenger Neon management integration. The mobile app must therefore keep self-delete unavailable until Neon exposes a supported secure path; do not fake deletion by deleting only profile rows.
- Android Internal APK workflow run #56 completed successfully. Artifact `k-ssenger-android-internal-release` was produced (~25 MB, SHA-256 digest recorded by GitHub Actions). It uses a CI-generated validation keystore and is for device validation, not Play Store trust/signing.

## Security invariants

- Authenticated realtime identity comes only from verified Neon Auth JWT `sub`.
- Never accept a caller-supplied user ID as authenticated identity.
- Never weaken RLS/authorization to unblock UX.
- Never expose database/provider secrets in mobile builds.
- Never log private plaintext, tokens or encryption keys.
- Never invent custom cryptography.
- Do not claim production E2EE until a vetted native device-key protocol is integrated and proven on real devices.
- Private/group plaintext composition remains locked until that E2EE gate is satisfied.
- K-MAP remains explicit opt-in; no background/permanent hidden tracking.

## Remaining premium V1 release gates

1. Vetted native E2EE/device-key protocol and real device proof before enabling private/group plaintext composition.
2. Native push token registration on Android/iOS and real-device delivery validation; server delivery is implemented.
3. Dedicated K-ssenger media upload/storage integration plus in-app playback for chat/K-Feed and photo/video Moments.
4. Native GPS permission/capture for creation of K-MAP shares; backend privacy/revoke/coarsening is implemented.
5. Supported secure Neon Auth self-service account deletion. Current managed Auth returns 404 for self-delete.
6. Full real two-device smoke covering offline/reconnect, push and receipt behavior.
7. Store-signed Android and iOS builds when signing credentials/tooling are available.

## Release rule

Keep PR #2 draft while any critical security/native gate above remains incomplete. Do not merge or call this production E2EE merely to obtain a release build.
