// SecureKeyStore — the ONLY module allowed to persist cryptographic
// secrets (private keys, session secrets). Backed by expo-secure-store,
// which uses Android Keystore / iOS Keychain under the hood.
//
// Hard rule: nothing in this app should ever call AsyncStorage with a
// private key, a signing key, or a derived session secret. If it's
// sensitive, it goes through this module.

import * as SecureStore from "expo-secure-store";
import { toBase64, fromBase64 } from "@/src/crypto/CryptoProvider";

const NAMESPACE = "kssenger.secure.v1.";

function namespacedKey(key) {
  return `${NAMESPACE}${key}`;
}

/** @param {string} key @param {Uint8Array} bytes */
export async function setSecretBytes(key, bytes) {
  await SecureStore.setItemAsync(namespacedKey(key), toBase64(bytes), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

/** @returns {Promise<Uint8Array|null>} */
export async function getSecretBytes(key) {
  const value = await SecureStore.getItemAsync(namespacedKey(key));
  return value ? fromBase64(value) : null;
}

export async function deleteSecret(key) {
  await SecureStore.deleteItemAsync(namespacedKey(key));
}

export async function hasSecret(key) {
  const value = await SecureStore.getItemAsync(namespacedKey(key));
  return value !== null;
}
