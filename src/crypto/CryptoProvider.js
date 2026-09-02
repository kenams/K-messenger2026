// CryptoProvider — thin wrapper around audited libsodium primitives.
//
// This module intentionally contains NO protocol logic (no session
// establishment, no ratchet, no key agreement flow). It only exposes
// low-level, audited operations from react-native-libsodium:
//   - identity keypairs (X25519 for agreement, Ed25519 for signing)
//   - authenticated encryption (XChaCha20-Poly1305 AEAD)
//   - signing / verification
//   - secure randomness
//   - raw scalar multiplication (X25519 ECDH) and key derivation,
//     exposed for whichever session protocol is chosen after the
//     vodozemac / libsignal-native-bridge feasibility spike
//     (see docs/CRYPTO_DECISION.md).
//
// Nothing here decides *how* a session is built — that decision is
// still pending Kenams' review of the spike results.

import sodium from "react-native-libsodium";

let readyPromise = null;

/** Must be awaited once before any other function in this module is used. */
export function cryptoReady() {
  if (!readyPromise) readyPromise = sodium.ready;
  return readyPromise;
}

// ---------- Identity keypairs ----------

/** X25519 keypair, used for key agreement (ECDH). Never leaves the device unencrypted. */
export function generateAgreementKeyPair() {
  const kp = sodium.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/** Ed25519 keypair, used to sign/authenticate identity + prekeys. */
export function generateSigningKeyPair() {
  const kp = sodium.crypto_sign_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

// ---------- Signing ----------

export function sign(message, signingPrivateKey) {
  return sodium.crypto_sign_detached(message, signingPrivateKey);
}

export function verifySignature(message, signature, signingPublicKey) {
  return sodium.crypto_sign_verify_detached(signature, message, signingPublicKey);
}

// ---------- Authenticated encryption (AEAD) ----------
// XChaCha20-Poly1305: 24-byte random nonce (safe to generate randomly,
// unlike the 12-byte ChaCha20-Poly1305 nonce), 32-byte key, detects any
// ciphertext tampering (auth tag verification fails -> throws).

// NOTE: these are read lazily (function, not module-level const) because
// react-native-libsodium resolves its native/WASM backend asynchronously —
// reading them before `await cryptoReady()` has resolved returns undefined.
export function aeadKeyBytes() {
  return sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
}
export function aeadNonceBytes() {
  return sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
}

export function generateAeadKey() {
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

/**
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} key 32 bytes
 * @param {Uint8Array} [associatedData] optional, authenticated but not encrypted
 * @returns {{ ciphertext: Uint8Array, nonce: Uint8Array }}
 */
export function aeadEncrypt(plaintext, key, associatedData = null) {
  const nonce = sodium.randombytes_buf(aeadNonceBytes());
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    associatedData,
    null,
    nonce,
    key
  );
  return { ciphertext, nonce };
}

/**
 * Throws if the key is wrong or the ciphertext was tampered with —
 * callers must not swallow this error silently.
 * @returns {Uint8Array} plaintext
 */
export function aeadDecrypt(ciphertext, nonce, key, associatedData = null) {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    associatedData,
    nonce,
    key
  );
}

// ---------- Key agreement primitive (raw X25519 ECDH) ----------
// Exposed for the eventual session protocol. Using this directly to
// build a hand-rolled session (skipping the spike in docs/CRYPTO_DECISION.md)
// is exactly what Kenams asked NOT to do yet.

export function scalarMult(privateKey, publicKey) {
  return sodium.crypto_scalarmult(privateKey, publicKey);
}

export function deriveKey(masterKey, subkeyId, context) {
  return sodium.crypto_kdf_derive_from_key(aeadKeyBytes(), subkeyId, context, masterKey);
}

// ---------- Randomness / encoding ----------

export function randomBytes(length) {
  return sodium.randombytes_buf(length);
}

export function toBase64(bytes) {
  return sodium.to_base64(bytes);
}

export function fromBase64(str) {
  return sodium.from_base64(str);
}

export function toUtf8(bytes) {
  return sodium.to_string(bytes);
}

export function fromUtf8(str) {
  return sodium.from_string(str);
}
