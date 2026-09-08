/**
 * K-ssenger device linking — web ↔ phone relay tunnel.
 *
 * The web client never runs Signal Protocol. When a web session is linked to
 * the account's phone, the phone stays the only libsignal participant: the web
 * sends the plaintext it composed to the phone through an authenticated
 * X25519 / XSalsa20-Poly1305 tunnel (NaCl `box`), the phone does the Signal
 * encryption and the `message:send`, and mirrors decrypted incoming messages
 * back through the same tunnel. The K-ssenger server only ever relays opaque
 * `{ciphertext, nonce}` blobs (`link:envelope`) between the two devices of the
 * same account — it never sees tunnel plaintext.
 *
 * This module is pure JS (works on web and native). tweetnacl is a widely
 * audited implementation; no crypto is written here.
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

export type LinkKeyPair = { publicKey: string; secretKey: string };

/** Fresh X25519 keypair, base64-encoded for transport / storage. */
export function generateLinkKeyPair(): LinkKeyPair {
  const kp = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(kp.publicKey),
    secretKey: naclUtil.encodeBase64(kp.secretKey),
  };
}

/** Precompute the shared key for a peer (base64 public) + our secret (base64). */
export function deriveSharedKey(peerPublicKeyB64: string, ourSecretKeyB64: string): string {
  const shared = nacl.box.before(
    naclUtil.decodeBase64(peerPublicKeyB64),
    naclUtil.decodeBase64(ourSecretKeyB64),
  );
  return naclUtil.encodeBase64(shared);
}

/** Seal a JSON payload into a `{ciphertext, nonce}` envelope. */
export function sealEnvelope(sharedKeyB64: string, payload: unknown): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const message = naclUtil.decodeUTF8(JSON.stringify(payload));
  const box = nacl.box.after(message, nonce, naclUtil.decodeBase64(sharedKeyB64));
  return { ciphertext: naclUtil.encodeBase64(box), nonce: naclUtil.encodeBase64(nonce) };
}

/** Open an envelope. Returns null on any authentication / parse failure. */
export function openEnvelope<T = unknown>(sharedKeyB64: string, ciphertext: string, nonce: string): T | null {
  try {
    const opened = nacl.box.open.after(
      naclUtil.decodeBase64(ciphertext),
      naclUtil.decodeBase64(nonce),
      naclUtil.decodeBase64(sharedKeyB64),
    );
    if (!opened) return null;
    return JSON.parse(naclUtil.encodeUTF8(opened)) as T;
  } catch {
    return null;
  }
}

/**
 * Six-digit visual confirmation code derived from the link id. Shown on both
 * screens so the user can be sure the phone is approving the right web session.
 * It is an anti-mixup check, not the security boundary (that is the shared
 * account room + RLS + tunnel authentication).
 */
export function linkConfirmationCode(linkId: string): string {
  const digest = nacl.hash(naclUtil.decodeUTF8(linkId));
  let n = 0;
  for (let i = 0; i < 4; i++) n = (n * 256 + digest[i]) >>> 0;
  return String(n % 1_000_000).padStart(6, '0');
}

/** Relay payloads carried inside the tunnel. */
export type RelayMessage =
  | { t: 'hello'; from: 'web' | 'phone' }
  | { t: 'ping'; id: string }
  | { t: 'pong'; id: string }
  | { t: 'history:req'; reqId: string; contactId: string }
  | { t: 'history:res'; reqId: string; ok: boolean; error?: string; messages: RelayChatMessage[] }
  | { t: 'send:req'; reqId: string; contactId: string; clientMessageId: string; text: string }
  | { t: 'send:res'; reqId: string; ok: boolean; error?: string; id?: string; createdAt?: string }
  | { t: 'recv'; contactId: string; message: RelayChatMessage };

export type RelayChatMessage = {
  id: string;
  senderUserId: string;
  createdAt: string;
  text: string;
};
