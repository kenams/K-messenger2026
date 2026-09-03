# K-ssenger - Security & Privacy Model

## Non-Negotiable Rules

- No private-message plaintext on the server, database, push payloads, logs or analytics.
- No private E2EE secret on the server.
- No improvised cryptographic protocol.
- Every device has its own cryptographic identity.
- HTTPS/WSS in production.
- Authentication, authorization and E2EE are separate controls.
- RLS and Socket.IO authorization must prevent IDOR and spoofing.

## Server Authentication

The server verifies Neon Auth JWTs with JWKS using `jose`. The accepted issuer is derived from `NEON_AUTH_BASE_URL`; the audience defaults to that issuer origin unless `NEON_AUTH_AUDIENCE` is explicitly configured. The socket `userId` is derived only from the verified JWT `sub` claim, which must be a UUID.

Any `senderId`, `ownerId`, `userId` or equivalent identity value sent by the client is ignored for trust decisions unless it is only a target identifier and is re-authorized server-side.

A `deviceId` must belong to the authenticated user, be active and not revoked.

## Authorization

Central helpers currently enforced server-side:

- `requireActiveDevice`
- `requireConversationMember`
- `requireConversationNotBlocked`
- `requireNotBlocked`

Every sensitive route/socket must pass the relevant authorization checks before reading or writing data.

## Database

The dedicated backend is Neon/Lakebase Postgres with Neon Auth and Data API. Client-facing direct data access must use RLS. Server-side runtime access uses parameterized SQL and derives identity from a verified token before executing user-scoped actions.

No K-ssenger runtime may depend on a Supabase project or Supabase service-role key.

## E2EE

The session protocol must be a recognized and tested implementation. Libsodium primitives may be used for auxiliary functions but do not justify a homegrown X3DH/Double Ratchet implementation.

Safety number/fingerprint/QR, identity-change warnings and device revocation must be visible to the user before any production E2EE claim.

## Attachments

Files must be encrypted client-side with a random per-file key. Only ciphertext is uploaded. Decryption metadata travels through the E2EE channel.

## Push

Push payloads are generic and contain no message plaintext. The client retrieves ciphertext and decrypts locally.

## K-MAP

Location is OFF by default. It requires explicit consent, a limited duration, selected precision and selected recipients. Ghost Mode must immediately stop active shares.

A blocked user immediately loses access to location shares. An expired session is no longer readable. There is no permanent route history by default.

Precise location is never included in analytics or detailed application logs.

## Logging

Required redaction: JWT, passwords, tokens, private keys, recovery keys, message plaintext, attachment keys and precise GPS coordinates.

## Minimum Tests

- missing/invalid/expired token
- wrong JWT issuer and audience
- spoofed sender or client-supplied user identity
- another user's device
- revoked device
- non-member conversation access
- blocked user access
- direct RLS checks
- another user's profile/privacy/presence mutation
- location access after expiration
- location access after block
- Ghost Mode
- ciphertext tamper/wrong key/replay/out-of-order
- automated plaintext search in DB/logs/push

## Reference

OWASP MASVS/MASTG is the mobile baseline. An external security review is recommended before any major public release.
