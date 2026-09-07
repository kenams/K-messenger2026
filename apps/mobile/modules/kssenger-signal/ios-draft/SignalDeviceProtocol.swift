import Foundation
import LibSignalClient

/// iOS port of the Android `SignalDeviceProtocol`.
///
/// Same public surface: provision / processRemoteBundle / hasSession / encrypt /
/// decrypt, same wire JSON shapes, same base64 (no-wrap) encoding. No custom
/// cryptography — only the official `LibSignalClient` primitives.
///
/// NOTE: written without a macOS/Xcode toolchain. Free-function names
/// (`processPreKeyBundle`, `signalEncrypt`, `signalDecrypt*`) and record
/// initializers follow the 0.x Swift API; verify against the pinned version.
final class SignalDeviceProtocolIOS {
  enum ProtocolError: Error {
    case invalidDeviceUuid
    case invalidSignalDeviceId
    case invalidPreKeyCount
    case plaintextTooLarge
    case ciphertextTooLarge
    case unsupportedMessageType
  }

  private let normalizedDeviceUuid: String
  private let blobs: KeychainBlobStore
  private let identity: KssengerIdentityStore
  private let sessions: KssengerSessionStore
  private let preKeys: KssengerPreKeyStore
  private let signedPreKeys: KssengerSignedPreKeyStore
  private let kyberPreKeys: KssengerKyberPreKeyStore
  private let ctx = NullContext()  // K-ssenger stores ignore StoreContext; a shared no-op is fine.

  init(deviceUuid: String) throws {
    guard let uuid = UUID(uuidString: deviceUuid) else { throw ProtocolError.invalidDeviceUuid }
    self.normalizedDeviceUuid = uuid.uuidString.lowercased()
    self.blobs = KeychainBlobStore(namespace: "signal-device-\(normalizedDeviceUuid)")
    self.identity = KssengerIdentityStore(blobs)
    self.sessions = KssengerSessionStore(blobs)
    self.preKeys = KssengerPreKeyStore(blobs)
    self.signedPreKeys = KssengerSignedPreKeyStore(blobs)
    self.kyberPreKeys = KssengerKyberPreKeyStore(blobs)
  }

  // MARK: helpers

  private func b64(_ bytes: [UInt8]) -> String { Data(bytes).base64EncodedString() }
  private func b64(_ data: Data) -> String { data.base64EncodedString() }
  private func decode(_ s: String) throws -> [UInt8] {
    guard let d = Data(base64Encoded: s) else { throw ProtocolError.unsupportedMessageType }
    return [UInt8](d)
  }

  private func address(_ userId: String, _ deviceId: Int) throws -> ProtocolAddress {
    guard let uuid = UUID(uuidString: userId) else { throw ProtocolError.invalidDeviceUuid }
    guard deviceId >= 1, deviceId <= 127 else { throw ProtocolError.invalidSignalDeviceId }
    return try ProtocolAddress(name: uuid.uuidString.lowercased(), deviceId: UInt32(deviceId))
  }

  private func nextKeyId(_ excluded: Set<UInt32>) -> UInt32 {
    for _ in 0..<1000 {
      let candidate = UInt32.random(in: 1...(UInt32.max - 1))
      if !excluded.contains(candidate) { return candidate }
    }
    return UInt32.random(in: 1...(UInt32.max - 1))
  }

  // MARK: provision

  func provision(oneTimeCount: Int = 20) throws -> [String: Any] {
    guard oneTimeCount >= 10, oneTimeCount <= 100 else { throw ProtocolError.invalidPreKeyCount }
    let identityPair = try identity.identityKeyPair(context: ctx)
    let registrationId = try identity.localRegistrationId(context: ctx)
    let now = UInt64(Date().timeIntervalSince1970 * 1000)

    var used = Set<UInt32>()

    let signedId = nextKeyId(used); used.insert(signedId)
    let signedPriv = PrivateKey.generate()
    let signedPub = signedPriv.publicKey
    let signedSig = identityPair.privateKey.generateSignature(message: signedPub.serialize())
    let signedRecord = try SignedPreKeyRecord(id: signedId, timestamp: now, privateKey: signedPriv, signature: signedSig)
    try signedPreKeys.storeSignedPreKey(signedRecord, id: signedId, context: ctx)

    let lastResortId = nextKeyId(used); used.insert(lastResortId)
    let lastResortPair = KEMKeyPair.generate()
    let lastResortSig = identityPair.privateKey.generateSignature(message: lastResortPair.publicKey.serialize())
    let lastResortRecord = try KyberPreKeyRecord(id: lastResortId, timestamp: now, keyPair: lastResortPair, signature: lastResortSig)
    try kyberPreKeys.storeLastResortKyberPreKey(lastResortRecord, id: lastResortId, context: ctx)

    var ecPublic: [[String: Any]] = []
    var pqPublic: [[String: Any]] = []
    for _ in 0..<oneTimeCount {
      let ecId = nextKeyId(used); used.insert(ecId)
      let ecPriv = PrivateKey.generate()
      let ecRecord = try PreKeyRecord(id: ecId, privateKey: ecPriv)
      try preKeys.storePreKey(ecRecord, id: ecId, context: ctx)
      ecPublic.append(["keyId": ecId, "publicKey": b64(ecPriv.publicKey.serialize())])

      let pqId = nextKeyId(used); used.insert(pqId)
      let pqPair = KEMKeyPair.generate()
      let pqSig = identityPair.privateKey.generateSignature(message: pqPair.publicKey.serialize())
      let pqRecord = try KyberPreKeyRecord(id: pqId, timestamp: now, keyPair: pqPair, signature: pqSig)
      try kyberPreKeys.storeKyberPreKey(pqRecord, id: pqId, context: ctx)
      pqPublic.append(["keyId": pqId, "publicKey": b64(pqPair.publicKey.serialize()), "signature": b64(pqSig)])
    }

    let bundleVersion = max(1, Int(Date().timeIntervalSince1970) & 0x7fffffff)
    return [
      "bundleVersion": bundleVersion,
      "registrationId": registrationId,
      "identityKey": b64(identityPair.identityKey.serialize()),
      "signedPreKeyId": signedId,
      "signedPreKeyPublic": b64(signedPub.serialize()),
      "signedPreKeySignature": b64(signedSig),
      "pqLastResortPreKeyId": lastResortId,
      "pqLastResortPreKeyPublic": b64(lastResortPair.publicKey.serialize()),
      "pqLastResortPreKeySignature": b64(lastResortSig),
      "oneTimePreKeys": ecPublic,
      "pqOneTimePreKeys": pqPublic,
    ]
  }

  // MARK: processRemoteBundle

  func processRemoteBundle(
    localUserId: String, localSignalDeviceId: Int,
    remoteUserId: String, remoteSignalDeviceId: Int,
    registrationId: Int,
    identityKeyB64: String,
    signedPreKeyId: Int, signedPreKeyPublicB64: String, signedPreKeySignatureB64: String,
    oneTimePreKeyId: Int?, oneTimePreKeyPublicB64: String?,
    pqPreKeyId: Int, pqPreKeyPublicB64: String, pqPreKeySignatureB64: String
  ) throws {
    let localAddress = try address(localUserId, localSignalDeviceId)
    let remoteAddress = try address(remoteUserId, remoteSignalDeviceId)

    let identityKey = try IdentityKey(bytes: try decode(identityKeyB64))
    let signedPub = try PublicKey(try decode(signedPreKeyPublicB64))
    let signedSig = try decode(signedPreKeySignatureB64)
    let kyberPub = try KEMPublicKey(try decode(pqPreKeyPublicB64))
    let kyberSig = try decode(pqPreKeySignatureB64)

    let bundle: PreKeyBundle
    if let otId = oneTimePreKeyId, let otPubB64 = oneTimePreKeyPublicB64 {
      let otPub = try PublicKey(try decode(otPubB64))
      bundle = try PreKeyBundle(
        registrationId: UInt32(registrationId),
        deviceId: UInt32(remoteSignalDeviceId),
        prekeyId: UInt32(otId),
        prekey: otPub,
        signedPrekeyId: UInt32(signedPreKeyId),
        signedPrekey: signedPub,
        signedPrekeySignature: signedSig,
        identity: identityKey,
        kyberPrekeyId: UInt32(pqPreKeyId),
        kyberPrekey: kyberPub,
        kyberPrekeySignature: kyberSig
      )
    } else {
      bundle = try PreKeyBundle(
        registrationId: UInt32(registrationId),
        deviceId: UInt32(remoteSignalDeviceId),
        signedPrekeyId: UInt32(signedPreKeyId),
        signedPrekey: signedPub,
        signedPrekeySignature: signedSig,
        identity: identityKey,
        kyberPrekeyId: UInt32(pqPreKeyId),
        kyberPrekey: kyberPub,
        kyberPrekeySignature: kyberSig
      )
    }

    _ = localAddress
    try processPreKeyBundle(
      bundle,
      for: remoteAddress,
      sessionStore: sessions,
      identityStore: identity,
      context: ctx
    )
  }

  // MARK: session state

  func hasSession(remoteUserId: String, remoteSignalDeviceId: Int) throws -> Bool {
    let addr = try address(remoteUserId, remoteSignalDeviceId)
    return sessions.containsSession(for: addr)
  }

  // MARK: encrypt / decrypt

  func encrypt(
    localUserId: String, localSignalDeviceId: Int,
    remoteUserId: String, remoteSignalDeviceId: Int,
    plaintext: String
  ) throws -> [String: Any] {
    let data = Array(plaintext.utf8)
    guard data.count <= 64 * 1024 else { throw ProtocolError.plaintextTooLarge }
    let remoteAddress = try address(remoteUserId, remoteSignalDeviceId)
    _ = try address(localUserId, localSignalDeviceId)

    let message = try signalEncrypt(
      message: data,
      for: remoteAddress,
      sessionStore: sessions,
      identityStore: identity,
      context: ctx
    )
    let kind: String
    switch message.messageType {
    case .preKey: kind = "prekey"
    case .whisper: kind = "signal"
    default: throw ProtocolError.unsupportedMessageType
    }
    return [
      "kind": kind,
      "ciphertext": b64(message.serialize()),
      "algorithm": "signal-libsignal-v3-pqxdh",
    ]
  }

  func decrypt(
    localUserId: String, localSignalDeviceId: Int,
    remoteUserId: String, remoteSignalDeviceId: Int,
    kind: String, ciphertextB64: String
  ) throws -> String {
    let bytes = try decode(ciphertextB64)
    guard bytes.count <= 2_000_000 else { throw ProtocolError.ciphertextTooLarge }
    let remoteAddress = try address(remoteUserId, remoteSignalDeviceId)
    _ = try address(localUserId, localSignalDeviceId)

    let clear: [UInt8]
    switch kind {
    case "prekey":
      let msg = try PreKeySignalMessage(bytes: bytes)
      clear = try signalDecryptPreKey(
        message: msg,
        from: remoteAddress,
        sessionStore: sessions,
        identityStore: identity,
        preKeyStore: preKeys,
        signedPreKeyStore: signedPreKeys,
        kyberPreKeyStore: kyberPreKeys,
        context: ctx
      )
    case "signal":
      let msg = try SignalMessage(bytes: bytes)
      clear = try signalDecrypt(
        message: msg,
        from: remoteAddress,
        sessionStore: sessions,
        identityStore: identity,
        context: ctx
      )
    default:
      throw ProtocolError.unsupportedMessageType
    }
    return String(decoding: clear, as: UTF8.self)
  }

  func clearState() throws {
    try blobs.clearAndDestroyKey()
  }

  // Probes used by getStatus().
  static func libsignalLoaded() -> Bool {
    _ = IdentityKeyPair.generate()
    return true
  }
}
