# K-ssenger Project State

Last verified: 2026-09-05
Active delivery branch: `fix/feed-kmap-contact-security`
Active PR: #2 (`Security hardening + messaging reliability`) — intentionally kept as draft while release/security gates remain open.

## Backend isolation

- Dedicated Neon project only: `late-flower-65059830` (`K-ssenger`).
- Region: `aws-eu-central-1`.
- Primary database: `kssenger`.
- Default Neon branch: `main` (`br-falling-sea-b1k36u32`).
- Do not connect this repository to any Supabase project or any non-K-ssenger database.
- Public mobile configuration is pinned to the dedicated Neon Auth/Data API endpoints and the K-ssenger realtime service. Secrets must remain in provider/CI secret stores.

## Verified Neon schema on main

The live `kssenger` database currently exposes the K-ssenger V1 tables required for the implemented backend surface, including:

- identity/profile/privacy: `profiles`, `devices`, `privacy_settings`, `user_age_profile`
- contacts/safety: `contact_requests`, `contacts`, `blocks`
- chat: `conversations`, `conversation_members`, `messages`, `message_receipts`
- group moderation: `group_bans`
- social: `public_videos`, `video_reports`, `moments`, `moment_views`, `moment_reactions`, `moment_reports`
- K-MAP: `location_shares`, `location_points`
- push registration: `push_subscriptions`

Repository migrations currently run from `0001_v1_core.sql` through `0009_push_subscriptions.sql`. Schema changes must continue to be tested branch-first and applied only to this dedicated Neon project.

## Operational today

- Neon Auth-backed login/session identity.
- Profile bootstrap/edit surface for handle, display identity, avatar/status fields supported by the current profile model.
- Contacts lifecycle with requests, acceptance, blocking and presence-aware contact UI.
- Realtime presence.
- K-Pulse attention interaction.
- Direct conversation creation/join/history with ciphertext-envelope storage only.
- Delivery/read receipt flow with privacy setting support.
- Automatic direct-chat reconnect plus conversation/history resynchronization after Socket.IO reconnect.
- Group creation/membership and group moderation backend, including mute/ban/unban and moderator-only ban listing.
- Account export through authenticated Data API/RLS without decrypting encrypted messages server-side.
- K-Feed, Moments and K-MAP have real database/RLS-backed application surfaces on the active branch; media storage/upload remains an explicit release gate.
- Push subscription schema/RLS exists; native push token registration/delivery is not yet release-complete.
- Blocked-user lifecycle is now exposed through authenticated, rate-limited realtime operations: owner-scoped `contacts:blocked` listing and explicit `contact:unblock`. Unblocking only removes the caller-owned block row and never recreates contacts automatically. Mobile management UI remains to be completed before this is counted as finished moderation UX.

## Security invariants

- Never accept a client-supplied user id as authenticated identity; realtime identity comes from verified Neon Auth JWT `sub`.
- Never weaken RLS/authorization to unblock a UI.
- Never log private plaintext, tokens or encryption keys.
- Never invent custom cryptography.
- Do not claim production E2EE until a vetted native device-key protocol is integrated and proven on real devices.
- The private/group plaintext composer remains locked until that E2EE gate is satisfied.
- K-MAP remains opt-in and privacy-controlled; no hidden or permanent tracking.

## Validation status

- PR head `7b3951bab3e99934328b422aaade5667613418ff`: CI run #267 succeeded.
- Realtime blocked-user management commit `54aec173dae7b085defba9f49a4d554d10544f6c` adds authenticated/rate-limited blocked listing and unblock handlers. CI for the latest documentation head must be green before this PR leaves draft.
- Neon project `late-flower-65059830` was re-verified on 2026-09-05 as the dedicated K-ssenger project; live `kssenger` contains the expected V1 schema families including Neon Auth, contacts/safety, chat, groups, K-Feed, Moments, K-MAP and push subscriptions.

## Critical V1 release gates

1. Green CI/security/RLS validation on the latest PR head.
2. Real two-account/two-device remote flow, including offline/reconnect and receipt behavior.
3. Vetted native E2EE/device-key protocol with device proof before enabling private/group plaintext composition.
4. Approved K-ssenger media storage/upload path for avatars, chat media, K-Feed and Moments; no reuse of another project's storage.
5. Native push token registration and delivery validation.
6. Complete report/block/moderation UX, including mobile blocked-user management, plus secure Neon Auth account deletion flow.
7. Final accessibility/error/retry polish and release-mode smoke tests.
8. Installable Android/iOS release builds; signed distribution only when signing credentials/tooling are available.

## Release rule

Keep PR #2 as a draft while any critical security/database validation gate above is incomplete. Do not merge merely to obtain a build. A release branch is appropriate only after the critical gates are demonstrably green.
