// Security-property tests for CryptoProvider (audited libsodium primitives
// only — no session protocol yet, see docs/CRYPTO_DECISION.md).
//
// These map to the "TEST N" items in Kenams' spec that are meaningful at
// the primitive level today:
//   TEST 1/2/3 (no plaintext in DB/wire/logs) — asserted here at the
//     ciphertext-shape level; the full end-to-end version needs the real
//     backend (Phase D) and is not claimed as done here.
//   TEST 4 (wrong key can't decrypt) — covered below.
//   TEST 5 (tampered ciphertext fails auth) — covered below.
//   TEST 6/7/8 (ratchet/multi-device/identity-change) — NOT applicable
//     yet, no session protocol exists at this stage.

import { describe, it, expect, beforeAll } from "vitest";
import {
  cryptoReady,
  generateAgreementKeyPair,
  generateSigningKeyPair,
  sign,
  verifySignature,
  aeadEncrypt,
  aeadDecrypt,
  generateAeadKey,
  randomBytes,
  fromUtf8,
  toUtf8,
} from "../src/crypto/CryptoProvider";

beforeAll(async () => {
  await cryptoReady();
});

describe("identity keypairs", () => {
  it("generates a 32-byte X25519 agreement keypair", () => {
    const kp = generateAgreementKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey.length).toBe(32);
  });

  it("generates a 32-byte Ed25519 signing keypair", () => {
    const kp = generateSigningKeyPair();
    expect(kp.publicKey.length).toBe(32);
  });

  it("two generated identities are never equal (real randomness, not a fixture)", () => {
    const a = generateSigningKeyPair();
    const b = generateSigningKeyPair();
    expect(Buffer.from(a.publicKey)).not.toEqual(Buffer.from(b.publicKey));
  });
});

describe("signing", () => {
  it("verifies a signature made with the matching private key", () => {
    const kp = generateSigningKeyPair();
    const msg = fromUtf8("device public bundle v1");
    const sig = sign(msg, kp.privateKey);
    expect(verifySignature(msg, sig, kp.publicKey)).toBe(true);
  });

  it("rejects a signature from a different identity (impersonation attempt)", () => {
    const real = generateSigningKeyPair();
    const attacker = generateSigningKeyPair();
    const msg = fromUtf8("device public bundle v1");
    const sig = sign(msg, attacker.privateKey);
    expect(verifySignature(msg, sig, real.publicKey)).toBe(false);
  });
});

describe("AEAD (TEST 1/2/3 — no plaintext leak)", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const key = generateAeadKey();
    const plaintext = "Salut Bob";
    const { ciphertext, nonce } = aeadEncrypt(fromUtf8(plaintext), key);
    const decrypted = aeadDecrypt(ciphertext, nonce, key);
    expect(toUtf8(decrypted)).toBe(plaintext);
  });

  it("the ciphertext never contains the plaintext bytes as a substring", () => {
    const key = generateAeadKey();
    const plaintext = "Salut Bob, comment tu vas ?";
    const { ciphertext } = aeadEncrypt(fromUtf8(plaintext), key);
    const ciphertextBuf = Buffer.from(ciphertext);
    const plaintextBuf = Buffer.from(plaintext, "utf8");
    expect(ciphertextBuf.includes(plaintextBuf)).toBe(false);
  });

  it("what would be sent over the wire (nonce + ciphertext) also carries no plaintext", () => {
    const key = generateAeadKey();
    const plaintext = "Salut Bob";
    const { ciphertext, nonce } = aeadEncrypt(fromUtf8(plaintext), key);
    const wirePayload = Buffer.concat([Buffer.from(nonce), Buffer.from(ciphertext)]);
    expect(wirePayload.toString("utf8").includes(plaintext)).toBe(false);
    expect(wirePayload.toString("base64").includes(plaintext)).toBe(false);
  });

  it("nonces are not reused across calls (required for XChaCha20-Poly1305 safety)", () => {
    const key = generateAeadKey();
    const n1 = aeadEncrypt(fromUtf8("a"), key).nonce;
    const n2 = aeadEncrypt(fromUtf8("a"), key).nonce;
    expect(Buffer.from(n1)).not.toEqual(Buffer.from(n2));
  });
});

describe("TEST 4 — wrong key cannot decrypt", () => {
  it("throws when decrypting with a different key", () => {
    const key = generateAeadKey();
    const wrongKey = generateAeadKey();
    const { ciphertext, nonce } = aeadEncrypt(fromUtf8("Salut Bob"), key);
    expect(() => aeadDecrypt(ciphertext, nonce, wrongKey)).toThrow();
  });
});

describe("TEST 5 — tampered ciphertext fails authentication", () => {
  it("throws when a single byte of the ciphertext is flipped", () => {
    const key = generateAeadKey();
    const { ciphertext, nonce } = aeadEncrypt(fromUtf8("Salut Bob"), key);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0xff;
    expect(() => aeadDecrypt(tampered, nonce, key)).toThrow();
  });

  it("throws when the nonce is altered (associated framing changes)", () => {
    const key = generateAeadKey();
    const { ciphertext, nonce } = aeadEncrypt(fromUtf8("Salut Bob"), key);
    const tamperedNonce = new Uint8Array(nonce);
    tamperedNonce[0] ^= 0xff;
    expect(() => aeadDecrypt(ciphertext, tamperedNonce, key)).toThrow();
  });

  it("throws when associated data does not match what was authenticated", () => {
    const key = generateAeadKey();
    const aad = fromUtf8("conversation:abc123");
    const { ciphertext, nonce } = aeadEncrypt(fromUtf8("Salut Bob"), key, aad);
    const wrongAad = fromUtf8("conversation:xyz999");
    expect(() => aeadDecrypt(ciphertext, nonce, key, wrongAad)).toThrow();
  });
});

describe("randomness", () => {
  it("randomBytes never returns an all-zero buffer (sanity, not a full RNG test)", () => {
    const b = randomBytes(32);
    expect(Buffer.from(b).equals(Buffer.alloc(32))).toBe(false);
  });
});
