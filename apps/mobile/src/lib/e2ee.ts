/**
 * Real end-to-end encryption for direct (1:1) messages.
 *
 * Each account holds a long-lived X25519 identity keypair. The private key
 * never leaves the device (SecureStore on native, localStorage on web — same
 * storage class already used for the device-link tunnel and Last.fm/Spotify
 * tokens in this app). The public key is the only thing ever written to the
 * server, on `profiles.e2e_public_key`.
 *
 * To send a direct message: derive the NaCl `box` shared secret from (my
 * private key, recipient's public key), seal the plaintext with a fresh
 * nonce, and store `{c: ciphertext, n: nonce}` (both base64) as the message's
 * `ciphertext` column under algorithm `kssenger-nacl-box-v1`. The server only
 * ever stores and relays that opaque JSON blob — it has no keys and cannot
 * read message content.
 *
 * Scope: direct messages only. Group messages still use the plaintext
 * transport (`chatTransport.ts`) — encrypting a group requires wrapping a
 * shared key per member and re-wrapping on membership changes, a separate
 * piece of work. Do not claim groups are encrypted anywhere in the UI.
 *
 * This is NOT a Signal-style Double Ratchet: there is one static keypair per
 * account, not per-message forward secrecy. It is still real E2EE — the
 * server cannot read messages, and only the two participants ever hold key
 * material — but if a device's private key were extracted, past messages
 * captured off the wire could retroactively be decrypted. A ratchet upgrade
 * is future work, not required for "the server can't read your messages".
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as ExpoCrypto from 'expo-crypto';
import { getBackend } from './backend';

let prngReady = false;
function ensurePRNG() {
  if (prngReady) return;
  nacl.setPRNG((x, n) => {
    const bytes = ExpoCrypto.getRandomBytes(n);
    for (let i = 0; i < n; i += 1) x[i] = bytes[i];
  });
  prngReady = true;
}
ensurePRNG();

export const ENCRYPTED_ALGO = 'kssenger-nacl-box-v1';

const SECRET_KEY_STORAGE_PREFIX = 'kssenger.e2ee.secretkey';

// Storage key MUST be scoped per userId — not a single shared slot. On a
// device/browser where more than one account ever logs in (two testers on
// the same laptop, a logout/login cycle, a shared family device), a bare
// key name let account B's ensureIdentityKeyPair() silently read back
// account A's still-present private key and adopt it as its own, uploading
// A's public key to B's profile row too. Both accounts then share one NaCl
// identity: messages a peer encrypted against B's (=A's) public key open
// fine by coincidence for whichever of A/B happens to hold that shared
// secret at that moment, but any concurrent/subsequent regeneration (e.g. a
// storage read hiccup on one of the two accounts silently minting a fresh
// keypair, per the try/catch below) desyncs the two rows and turns already
// -sent messages permanently undecryptable — exactly the same class of bug
// already fixed for `cachedDevice` in chatTransport.ts.
function secretKeyStorageKey(userId: string): string {
  return `${SECRET_KEY_STORAGE_PREFIX}.${userId}`;
}

const LEGACY_UNSCOPED_KEY = SECRET_KEY_STORAGE_PREFIX;

/**
 * Reads this account's identity secret key, migrating a pre-existing legacy
 * unscoped key (from before storage was namespaced per userId) into the new
 * namespaced slot the first time it's seen, so a device that already had a
 * real single-account identity keeps it instead of silently rotating keys
 * on upgrade. Only migrates when the namespaced slot is empty — a device
 * that has already seen a second account (namespaced slot populated) must
 * not adopt the legacy leftover from a different, earlier account.
 */
async function readSecretKey(userId: string): Promise<string | null> {
  try {
    const key = secretKeyStorageKey(userId);
    if (Platform.OS === 'web') {
      const existing = globalThis.localStorage?.getItem(key) ?? null;
      if (existing) return existing;
      const legacy = globalThis.localStorage?.getItem(LEGACY_UNSCOPED_KEY) ?? null;
      if (legacy) {
        globalThis.localStorage?.setItem(key, legacy);
        globalThis.localStorage?.removeItem(LEGACY_UNSCOPED_KEY);
      }
      return legacy;
    }
    const existing = await SecureStore.getItemAsync(key.replace(/[.:]/g, '_'));
    if (existing) return existing;
    const legacy = await SecureStore.getItemAsync(LEGACY_UNSCOPED_KEY.replace(/\./g, '_'));
    if (legacy) {
      await SecureStore.setItemAsync(key.replace(/[.:]/g, '_'), legacy);
      await SecureStore.deleteItemAsync(LEGACY_UNSCOPED_KEY.replace(/\./g, '_'));
    }
    return legacy;
  } catch {
    return null;
  }
}

async function writeSecretKey(userId: string, value: string): Promise<void> {
  try {
    const key = secretKeyStorageKey(userId);
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(key, value); return; }
    await SecureStore.setItemAsync(key.replace(/[.:]/g, '_'), value);
  } catch {
    /* best effort — if this fails, encryption for this device just won't be available */
  }
}

// Keyed by userId — not a single shared value (same reasoning as
// `cachedDevice` in chatTransport.ts): a bare module-level cache would hand
// user B account A's in-memory keypair if B signs in right after A signs
// out without a full page reload.
let cachedKeyPair: { userId: string; publicKey: string; secretKey: string } | null = null;
let ensureInFlight: { userId: string; promise: Promise<{ publicKey: string; secretKey: string } | null> } | null = null;

/**
 * Loads this device's identity keypair, generating and publishing one on
 * first use. Returns null if the server rejects the public-key upload (e.g.
 * the column isn't visible via the Data API's schema cache yet) — callers
 * must fall back to the plaintext transport in that case, not throw.
 */
export async function ensureIdentityKeyPair(userId: string): Promise<{ publicKey: string; secretKey: string } | null> {
  if (cachedKeyPair && cachedKeyPair.userId === userId) return cachedKeyPair;
  if (ensureInFlight && ensureInFlight.userId === userId) return ensureInFlight.promise;

  const promise = (async () => {
    try {
      ensurePRNG();
      let secretKeyB64 = await readSecretKey(userId);
      let publicKeyB64: string;
      if (secretKeyB64) {
        const secretKey = naclUtil.decodeBase64(secretKeyB64);
        publicKeyB64 = naclUtil.encodeBase64(nacl.box.keyPair.fromSecretKey(secretKey).publicKey);
      } else {
        const kp = nacl.box.keyPair();
        secretKeyB64 = naclUtil.encodeBase64(kp.secretKey);
        publicKeyB64 = naclUtil.encodeBase64(kp.publicKey);
        await writeSecretKey(userId, secretKeyB64);
      }

      const { error } = await getBackend().from('profiles').update({ e2e_public_key: publicKeyB64 }).eq('id', userId);
      if (error) return null;

      cachedKeyPair = { userId, publicKey: publicKeyB64, secretKey: secretKeyB64 };
      return { publicKey: publicKeyB64, secretKey: secretKeyB64 };
    } catch {
      return null;
    } finally {
      if (ensureInFlight && ensureInFlight.userId === userId) ensureInFlight = null;
    }
  })();

  ensureInFlight = { userId, promise };
  return promise;
}

/**
 * Read-only variant for passive surfaces (conversation-list previews):
 * returns this device's existing secret key, or null. Never generates or
 * publishes a keypair — merely viewing a list must not rotate the account's
 * public key (that would make every other device's history undecryptable).
 */
export async function loadExistingSecretKey(userId: string): Promise<string | null> {
  if (cachedKeyPair && cachedKeyPair.userId === userId) return cachedKeyPair.secretKey;
  try {
    return await readSecretKey(userId);
  } catch {
    return null;
  }
}

/** The recipient's public key, or null if they have none yet (not upgraded / lookup failed). */
export async function fetchPeerPublicKey(userId: string): Promise<string | null> {
  try {
    const { data, error } = await getBackend().from('profiles').select('e2e_public_key').eq('id', userId).maybeSingle();
    if (error) return null;
    const key = (data as { e2e_public_key?: string | null } | null)?.e2e_public_key;
    return key && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

export function encryptDirectMessage(plaintext: string, mySecretKeyB64: string, peerPublicKeyB64: string): { algorithm: string; ciphertext: string } {
  ensurePRNG();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sealed = nacl.box(
    naclUtil.decodeUTF8(plaintext),
    nonce,
    naclUtil.decodeBase64(peerPublicKeyB64),
    naclUtil.decodeBase64(mySecretKeyB64),
  );
  return {
    algorithm: ENCRYPTED_ALGO,
    ciphertext: JSON.stringify({ c: naclUtil.encodeBase64(sealed), n: naclUtil.encodeBase64(nonce) }),
  };
}

/** Returns the decrypted text, or null if it can't be opened (wrong/missing keys, tampered data). */
export function decryptDirectMessage(ciphertextJson: string, mySecretKeyB64: string, peerPublicKeyB64: string): string | null {
  try {
    const { c, n } = JSON.parse(ciphertextJson) as { c: string; n: string };
    const opened = nacl.box.open(
      naclUtil.decodeBase64(c),
      naclUtil.decodeBase64(n),
      naclUtil.decodeBase64(peerPublicKeyB64),
      naclUtil.decodeBase64(mySecretKeyB64),
    );
    if (!opened) return null;
    return naclUtil.encodeUTF8(opened);
  } catch {
    return null;
  }
}
