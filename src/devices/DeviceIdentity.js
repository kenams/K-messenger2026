// DeviceIdentity — generates and loads THIS device's cryptographic identity.
//
// Each device gets its own Ed25519 signing keypair and X25519 agreement
// keypair, generated locally on first run. Private keys never leave the
// device and are only ever persisted through SecureKeyStore (Keychain /
// Android Keystore). Only public keys + deviceId are meant to be published
// to a backend later.
//
// This module does NOT talk to any server and does NOT establish sessions
// with other devices — that's the pending protocol decision
// (docs/CRYPTO_DECISION.md).

import * as SecureStore from "expo-secure-store";
import {
  cryptoReady,
  generateAgreementKeyPair,
  generateSigningKeyPair,
  randomBytes,
  toBase64,
} from "@/src/crypto/CryptoProvider";
import { setSecretBytes, getSecretBytes, hasSecret } from "@/src/storage/SecureKeyStore";

const DEVICE_ID_STORE_KEY = "kssenger.device.id.v1";
const SIGNING_PRIVATE_KEY = "device.signing.private";
const SIGNING_PUBLIC_KEY = "device.signing.public";
const AGREEMENT_PRIVATE_KEY = "device.agreement.private";
const AGREEMENT_PUBLIC_KEY = "device.agreement.public";

const PROTOCOL_VERSION = 0; // 0 = pre-protocol-decision, primitives only

async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_STORE_KEY);
  if (existing) return existing;
  await cryptoReady();
  const id = toBase64(randomBytes(16)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 22);
  await SecureStore.setItemAsync(DEVICE_ID_STORE_KEY, id);
  return id;
}

/**
 * Idempotent: returns the existing identity if one was already generated
 * on this device, otherwise generates and persists a new one.
 * @returns {Promise<import("@/src/types/devices").DeviceLocalIdentity>}
 */
export async function loadOrCreateDeviceIdentity() {
  await cryptoReady();
  const deviceId = await getOrCreateDeviceId();

  const alreadyProvisioned = await hasSecret(SIGNING_PRIVATE_KEY);
  if (!alreadyProvisioned) {
    const signingKeyPair = generateSigningKeyPair();
    const agreementKeyPair = generateAgreementKeyPair();
    await setSecretBytes(SIGNING_PRIVATE_KEY, signingKeyPair.privateKey);
    await setSecretBytes(SIGNING_PUBLIC_KEY, signingKeyPair.publicKey);
    await setSecretBytes(AGREEMENT_PRIVATE_KEY, agreementKeyPair.privateKey);
    await setSecretBytes(AGREEMENT_PUBLIC_KEY, agreementKeyPair.publicKey);
  }

  const [signingPriv, signingPub, agreementPriv, agreementPub] = await Promise.all([
    getSecretBytes(SIGNING_PRIVATE_KEY),
    getSecretBytes(SIGNING_PUBLIC_KEY),
    getSecretBytes(AGREEMENT_PRIVATE_KEY),
    getSecretBytes(AGREEMENT_PUBLIC_KEY),
  ]);

  return {
    deviceId,
    signingKeyPair: { publicKey: signingPub, privateKey: signingPriv },
    agreementKeyPair: { publicKey: agreementPub, privateKey: agreementPriv },
  };
}

/**
 * The subset of the identity that is safe to publish to a backend.
 * @param {import("@/src/types/devices").DeviceLocalIdentity} identity
 * @param {{platform: string, name: string}} deviceMeta
 * @returns {import("@/src/types/devices").DevicePublicInfo}
 */
export function toPublicInfo(identity, deviceMeta) {
  return {
    deviceId: identity.deviceId,
    platform: deviceMeta.platform,
    name: deviceMeta.name,
    identitySigningPublicKeyB64: toBase64(identity.signingKeyPair.publicKey),
    identityAgreementPublicKeyB64: toBase64(identity.agreementKeyPair.publicKey),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
  };
}

/** Revokes this device's identity locally (e.g. "log out this device" / factory reset). */
export async function wipeDeviceIdentity() {
  await Promise.all([
    SecureStore.deleteItemAsync(DEVICE_ID_STORE_KEY),
  ]);
  const { deleteSecret } = await import("@/src/storage/SecureKeyStore");
  await Promise.all([
    deleteSecret(SIGNING_PRIVATE_KEY),
    deleteSecret(SIGNING_PUBLIC_KEY),
    deleteSecret(AGREEMENT_PRIVATE_KEY),
    deleteSecret(AGREEMENT_PUBLIC_KEY),
  ]);
}
