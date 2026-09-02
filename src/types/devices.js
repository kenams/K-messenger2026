// Shared type documentation (plain JS + JSDoc — no TS toolchain added yet,
// consistent with the existing App.js). These typedefs describe the shapes
// used by DeviceIdentity / the future `devices` backend table.

/**
 * Public information about one of a user's devices. Safe to publish/store
 * server-side as-is — contains NO private key material.
 * @typedef {Object} DevicePublicInfo
 * @property {string} deviceId - stable random id, generated locally
 * @property {string} platform - "ios" | "android" | "web"
 * @property {string} name - human label, e.g. "iPhone de Kenams"
 * @property {string} identitySigningPublicKeyB64 - Ed25519 public key
 * @property {string} identityAgreementPublicKeyB64 - X25519 public key
 * @property {number} createdAt - epoch ms
 * @property {number} lastSeenAt - epoch ms
 * @property {number} protocolVersion - bumped when the session protocol changes
 */

/**
 * @typedef {Object} DeviceLocalIdentity
 * @property {string} deviceId
 * @property {{publicKey: Uint8Array, privateKey: Uint8Array}} signingKeyPair - Ed25519
 * @property {{publicKey: Uint8Array, privateKey: Uint8Array}} agreementKeyPair - X25519
 */

export {};
