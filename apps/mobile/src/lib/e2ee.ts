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

const SECRET_KEY_STORAGE = 'kssenger.e2ee.secretkey';

async function readSecretKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(SECRET_KEY_STORAGE) ?? null;
    return await SecureStore.getItemAsync(SECRET_KEY_STORAGE.replace(/\./g, '_'));
  } catch {
    return null;
  }
}

async function writeSecretKey(value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(SECRET_KEY_STORAGE, value); return; }
    await SecureStore.setItemAsync(SECRET_KEY_STORAGE.replace(/\./g, '_'), value);
  } catch {
    /* best effort — if this fails, encryption for this device just won't be available */
  }
}

let cachedKeyPair: { publicKey: string; secretKey: string } | null = null;
let ensureInFlight: Promise<{ publicKey: string; secretKey: string } | null> | null = null;

/**
 * Loads this device's identity keypair, generating and publishing one on
 * first use. Returns null if the server rejects the public-key upload (e.g.
 * the column isn't visible via the Data API's schema cache yet) — callers
 * must fall back to the plaintext transport in that case, not throw.
 */
export async function ensureIdentityKeyPair(userId: string): Promise<{ publicKey: string; secretKey: string } | null> {
  if (cachedKeyPair) return cachedKeyPair;
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    try {
      ensurePRNG();
      let secretKeyB64 = await readSecretKey();
      let publicKeyB64: string;
      if (secretKeyB64) {
        const secretKey = naclUtil.decodeBase64(secretKeyB64);
        publicKeyB64 = naclUtil.encodeBase64(nacl.box.keyPair.fromSecretKey(secretKey).publicKey);
      } else {
        const kp = nacl.box.keyPair();
        secretKeyB64 = naclUtil.encodeBase64(kp.secretKey);
        publicKeyB64 = naclUtil.encodeBase64(kp.publicKey);
        await writeSecretKey(secretKeyB64);
      }

      const { error } = await getBackend().from('profiles').update({ e2e_public_key: publicKeyB64 }).eq('id', userId);
      if (error) return null;

      cachedKeyPair = { publicKey: publicKeyB64, secretKey: secretKeyB64 };
      return cachedKeyPair;
    } catch {
      return null;
    } finally {
      ensureInFlight = null;
    }
  })();

  return ensureInFlight;
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
