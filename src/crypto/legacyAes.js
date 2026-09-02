// legacyAes — DEPRECATED. Shared-passphrase AES-CBC, no authentication,
// no per-device identity, no forward secrecy. Isolated here (out of App.js)
// so it is trivial to delete once the real E2EE session protocol
// (docs/CRYPTO_DECISION.md) replaces it in Phase E.
//
// DO NOT use this for anything beyond the existing nostalgia demo chat.
// DO NOT extend it. DO NOT wire a real backend to it.

import CryptoES from "crypto-es";

const PBKDF2_SALT = "k-ssenger-salt-v1";
const PBKDF2_ITER = 100000;

export function legacyDeriveKeyFromPassphrase(pwd) {
  const salt = CryptoES.enc.Utf8.parse(PBKDF2_SALT);
  return CryptoES.PBKDF2(pwd, salt, {
    keySize: 256 / 32,
    iterations: PBKDF2_ITER,
    hasher: CryptoES.algo.SHA256,
  });
}

export function legacyEncryptText(plain, cryptoKey) {
  if (!cryptoKey) throw new Error("Pas de clé");
  const iv = CryptoES.lib.WordArray.random(16);
  const encrypted = CryptoES.AES.encrypt(plain, cryptoKey, {
    iv,
    mode: CryptoES.mode.CBC,
    padding: CryptoES.pad.Pkcs7,
  });
  return {
    cipherText: encrypted.toString(),
    iv: CryptoES.enc.Base64.stringify(iv),
  };
}

export function legacyDecryptText(cipherText, ivBase64, cryptoKey) {
  if (!cryptoKey) throw new Error("Pas de clé");
  const iv = CryptoES.enc.Base64.parse(ivBase64);
  const decrypted = CryptoES.AES.decrypt(cipherText, cryptoKey, {
    iv,
    mode: CryptoES.mode.CBC,
    padding: CryptoES.pad.Pkcs7,
  });
  return decrypted.toString(CryptoES.enc.Utf8);
}
