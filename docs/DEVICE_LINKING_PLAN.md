# K-ssenger web/mobile device linking (WhatsApp Web model)

## Problem

The web build cannot run libsignal: Signal does not publish an official
browser/WASM build of `@signalapp/libsignal-client` (Node native bindings and
Android/iOS native bindings only, verified 2026-09-06). The only "web"
libsignal package found on npm is an unaudited third-party wrapper from an
unknown maintainer — unacceptable for a messaging app's core crypto per this
project's security invariants (never invent or adopt unvetted cryptography).

WhatsApp Web does not solve this by running Signal Protocol independently in
the browser either: the web client is a **linked device** that relays through
the phone, which remains the only Signal Protocol participant.

## Design: phone-relayed linked session

The phone (which already has real libsignal) stays the only Signal Protocol
participant. The web client never touches Signal Protocol keys or ciphertext
semantics. Instead:

1. **Pairing (QR code)**: the web client generates an ephemeral ECDH key pair
   with the browser's native `SubtleCrypto` (P-256), encodes the public key +
   a random `linkId` in a QR code. The phone scans it, derives a shared secret
   via ECDH (native platform crypto), and both sides derive an AES-GCM session
   key via HKDF from that shared secret. This uses only standard, audited
   browser/OS crypto primitives (WebCrypto / Android Keystore-backed ECDH),
   not a custom cipher — the same class of primitive Signal itself builds on,
   just without claiming Signal Protocol/E2EE-between-users semantics for the
   phone<->web hop. This hop is phone<->web only, single physical owner on
   both ends.
2. **Relay**: once paired, the phone forwards each already-decrypted incoming
   message (and outgoing messages the user sends from web) through the
   existing Socket.IO server as an opaque `link:envelope` blob, encrypted
   with the pairing session's AES-GCM key. The server relays bytes it cannot
   read, exactly like it already does for Signal ciphertext.
3. **Revocation**: unlinking (from either side) invalidates the session key
   and removes the link row; the server enforces that only the two paired
   parties (phone's `userId` + the specific web session) can send/receive on
   a given `linkId`.

## What ships in this pass (server-side, testable without a phone)

- `link:init` (web -> server): registers a pending link request for the
  authenticated user with the web-generated ECDH public key. Returns a
  `linkId`.
- `link:approve` (phone -> server): the phone, already authenticated as the
  same `userId`, approves a pending `linkId` and returns its own ECDH public
  key. Only the same user can approve their own pending link (checked
  server-side against `socket.data.userId`, never trusting a client-supplied
  id).
- `link:envelope` (either side -> server -> the other side): relays an
  opaque encrypted blob for an *approved* `linkId` only. Rejects if the link
  is not approved, revoked, or the sender is not one of the two link parties.
- `link:revoke`: either side can kill a link; server stops relaying on it
  immediately and notifies the other side.
- New table `public.device_links` (RLS: a row is only readable/writable by
  its owning `user_id`), migration `0020_device_links.sql`.

## What is explicitly NOT done in this pass (needs a real Android device)

- The mobile-side QR scanner screen and the actual "forward my decrypted
  messages to my linked web session" logic in the chat send/receive path.
- The web-side QR display screen, WebCrypto key derivation, and the web chat
  UI wired to `link:envelope` instead of the (still fail-closed) direct
  libsignal path.
- Any physical-device end-to-end proof. This cannot be faked; it requires an
  Android device or emulator, which this environment does not have.

## Resume checklist

1. Migration `0020_device_links.sql` applied to the live Neon project?
2. `link:init` / `link:approve` / `link:envelope` / `link:revoke` unit tests
   green?
3. Mobile: add a "Linked devices" screen (QR scan) that calls `link:approve`
   and starts forwarding plaintext of new messages through `link:envelope`
   once approved.
4. Web: add a "Connecter cet ordinateur" screen (QR display) that calls
   `link:init`, waits for approval, derives the AES-GCM key, and once linked
   replaces the "verrouillé" chat screen with one that sends/receives through
   `link:envelope`.
5. Real two-device proof (phone + web) before claiming this feature works.
