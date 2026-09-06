# K-ssenger - Target Architecture

## Principle

K-ssenger is an independently branded social mobile messenger with nostalgic instant-messaging behavior, modern security and strong privacy controls. It must not imply affiliation with Microsoft or reuse Microsoft assets.

## Monorepo

```text
apps/
  mobile/              React Native + Expo Dev Build
  server/              Node.js + TypeScript + Socket.IO
packages/
  contracts/           shared network DTOs, ciphertext-only private messages
  config/              shared non-secret configuration
  ui/                  reusable tokens/components when useful
docs/
  PRODUCT_VISION.md
  UX_SPEC.md
  KMAP_SPEC.md
  SECURITY_MODEL.md
  ACCEPTANCE_TESTS.md
  PROJECT_STATE.md
neon/
  migrations/
```

Historical Supabase migrations remain in the repository only as legacy project history until they can be safely archived. They are not the target runtime backend.

## Mobile

Domains: auth, onboarding, profiles, contacts, presence, conversations, messages, crypto, realtime, notifications, media, calls, K-MAP, Moments, moderation and settings.

Cryptographic secrets: Keychain/Keystore only. AsyncStorage never stores a private key, recovery key or E2EE session secret.

## Backend

Domains: auth, users, devices, contacts, blocks, presence, conversations, messages, realtime, notifications, attachments, calls, location-sharing, moderation, security and jobs.

The server knows the authenticated identity, authorization state and service metadata needed to operate K-ssenger. It never receives private-message plaintext.

Socket.IO authentication verifies Neon Auth JWTs with JWKS. The server derives `userId` from the verified token and never trusts a client-provided identity.

## Database

Dedicated backend: Neon/Lakebase Postgres project `K-ssenger` only.

Core tables: `profiles`, `privacy_settings`, `contacts`, `contact_requests`, `blocks`, `conversations`, `conversation_members`, `devices`, `messages`, `message_receipts`.

Client-facing data access uses Neon Auth/Data API with RLS. Server-side runtime access uses parameterized SQL and server-side authorization checks before every sensitive operation.

## Realtime

Each socket is authenticated. Every action checks membership, device ownership, block state and privacy policy as applicable.

K-Pulse is the public attention feature. Legacy Wizz naming can remain temporarily only inside protocol compatibility code until migrated.

## Environments

Local, development, staging and production must be separated. HTTPS/WSS only outside local development. No secret goes into `EXPO_PUBLIC_*`.

## Integration Order

1. Neon Auth/AuthZ/RLS
2. Contacts + presence
3. K-Pulse
4. reliable private chat and offline replay
5. groups
6. recognized/auditable E2EE on devices
7. push
8. encrypted attachments
9. secure K-MAP
10. K-Feed + Moments
11. calls
12. moderation/export/delete account
13. store hardening/release
