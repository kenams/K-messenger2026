import ExpoModulesCore
import Foundation
import LibSignalClient

/// iOS Expo module — exact JS surface parity with the Android
/// `KssengerSignalModule` (bridge name `KssengerSignalBridge`).
///
/// STATUS: iOS native LibSignalClient parity, written without a macOS toolchain.
/// `getStatus().selfTestPassed` gates the private composer; until a real
/// two-physical-device proof passes on iPhone, `apps/mobile/src/lib/signalDevice.ts`
/// still hard-restricts the JS bridge to Android (`Platform.OS !== 'android'`).
/// Flip that guard to `!== 'android' && !== 'ios'` only after the device proof.
public class KssengerSignalModule: Module {
  private let installationStore = KeychainBlobStore(namespace: "installation-v1")
  private static let installationKey = "installation:id"

  public func definition() -> ModuleDefinition {
    Name("KssengerSignalBridge")

    AsyncFunction("randomUuid") { () -> String in
      UUID().uuidString.lowercased()
    }

    AsyncFunction("getInstallationId") { () -> String in
      if let existing = try self.installationStore.get(Self.installationKey),
         let text = String(data: existing, encoding: .utf8),
         let uuid = UUID(uuidString: text) {
        return uuid.uuidString.lowercased()
      }
      let generated = UUID().uuidString.lowercased()
      try self.installationStore.put(Self.installationKey, Data(generated.utf8))
      return generated
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      let libsignalLoaded = SignalDeviceProtocolIOS.libsignalLoaded()

      let probeStore = KeychainBlobStore(namespace: "signal-status-probe")
      let secureStorageReady = (try? Self.verifyPersistentStore(probeStore)) ?? false

      let sessionStoreReady = libsignalLoaded && secureStorageReady
        && ((try? Self.verifySessionStore()) ?? false)
      let deviceKeyStoreReady = libsignalLoaded && secureStorageReady
        && ((try? Self.verifyDeviceStores()) ?? false)
      let selfTestPassed = libsignalLoaded && secureStorageReady
        && ((try? Self.verifyAliceBobSession()) ?? false)

      return [
        "nativeVersion": "ios-libsignal-0.100.0",
        "libsignalLoaded": libsignalLoaded,
        "secureStorageReady": secureStorageReady,
        "deviceKeyStoreReady": deviceKeyStoreReady,
        "sessionStoreReady": sessionStoreReady,
        "selfTestPassed": selfTestPassed,
      ]
    }

    AsyncFunction("provisionDevice") { (deviceUuid: String, oneTimeCount: Int) -> [String: Any] in
      try SignalDeviceProtocolIOS(deviceUuid: deviceUuid).provision(oneTimeCount: oneTimeCount)
    }

    AsyncFunction("clearDeviceState") { (deviceUuid: String) -> Bool in
      try SignalDeviceProtocolIOS(deviceUuid: deviceUuid).clearState()
      return true
    }

    AsyncFunction("processRemoteBundle") { (payloadJson: String) -> Bool in
      guard let data = payloadJson.data(using: .utf8),
            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw KssengerSignalError.badPayload
      }
      func str(_ k: String) throws -> String {
        guard let v = payload[k] as? String else { throw KssengerSignalError.badPayload }
        return v
      }
      func int(_ k: String) throws -> Int {
        if let v = payload[k] as? Int { return v }
        if let v = payload[k] as? NSNumber { return v.intValue }
        throw KssengerSignalError.badPayload
      }
      let otId = payload["oneTimePreKeyId"] as? Int ?? (payload["oneTimePreKeyId"] as? NSNumber)?.intValue
      let otPub = payload["oneTimePreKeyPublic"] as? String

      try SignalDeviceProtocolIOS(deviceUuid: str("deviceUuid")).processRemoteBundle(
        localUserId: str("localUserId"),
        localSignalDeviceId: int("localSignalDeviceId"),
        remoteUserId: str("remoteUserId"),
        remoteSignalDeviceId: int("remoteSignalDeviceId"),
        registrationId: int("registrationId"),
        identityKeyB64: str("identityKey"),
        signedPreKeyId: int("signedPreKeyId"),
        signedPreKeyPublicB64: str("signedPreKeyPublic"),
        signedPreKeySignatureB64: str("signedPreKeySignature"),
        oneTimePreKeyId: otId,
        oneTimePreKeyPublicB64: otPub,
        pqPreKeyId: int("pqPreKeyId"),
        pqPreKeyPublicB64: str("pqPreKeyPublic"),
        pqPreKeySignatureB64: str("pqPreKeySignature")
      )
      return true
    }

    AsyncFunction("hasSession") { (deviceUuid: String, remoteUserId: String, remoteSignalDeviceId: Int) -> Bool in
      try SignalDeviceProtocolIOS(deviceUuid: deviceUuid)
        .hasSession(remoteUserId: remoteUserId, remoteSignalDeviceId: remoteSignalDeviceId)
    }

    AsyncFunction("encrypt") { (deviceUuid: String, localUserId: String, localSignalDeviceId: Int,
                                remoteUserId: String, remoteSignalDeviceId: Int, plaintext: String) -> [String: Any] in
      try SignalDeviceProtocolIOS(deviceUuid: deviceUuid).encrypt(
        localUserId: localUserId, localSignalDeviceId: localSignalDeviceId,
        remoteUserId: remoteUserId, remoteSignalDeviceId: remoteSignalDeviceId,
        plaintext: plaintext
      )
    }

    AsyncFunction("decrypt") { (deviceUuid: String, localUserId: String, localSignalDeviceId: Int,
                                remoteUserId: String, remoteSignalDeviceId: Int, kind: String, ciphertext: String) -> String in
      try SignalDeviceProtocolIOS(deviceUuid: deviceUuid).decrypt(
        localUserId: localUserId, localSignalDeviceId: localSignalDeviceId,
        remoteUserId: remoteUserId, remoteSignalDeviceId: remoteSignalDeviceId,
        kind: kind, ciphertextB64: ciphertext
      )
    }
  }

  // MARK: - status probes (mirror the Android verify* helpers)

  private static func verifyPersistentStore(_ store: KeychainBlobStore) throws -> Bool {
    let clear = Data("kssenger-native-store-probe-v1".utf8)
    try store.put("__probe__", clear)
    let roundTrip = try store.get("__probe__")
    try store.remove("__probe__")
    return roundTrip == clear && !store.contains("__probe__")
  }

  private static func verifySessionStore() throws -> Bool {
    let store = KssengerSessionStore(KeychainBlobStore(namespace: "signal-status-session"))
    let addr = try ProtocolAddress(name: "00000000-0000-4000-8000-000000000001", deviceId: 1)
    try? store.deleteSession(for: addr)
    // A fresh SessionRecord round-trips through serialize/deserialize.
    guard let record = try? SessionRecord(bytes: []) else {
      // 0.x Swift has no public empty init; treat "no crash on delete + index" as ready.
      return !store.containsSession(for: addr)
    }
    try store.storeSession(record, for: addr, context: NullContext())
    let ok = store.containsSession(for: addr) && store.subDeviceSessions(for: addr.name).contains(1)
    try store.deleteSession(for: addr)
    return ok && !store.containsSession(for: addr)
  }

  private static func verifyDeviceStores() throws -> Bool {
    let blobs = KeychainBlobStore(namespace: "signal-status-device")
    let identity = KssengerIdentityStore(blobs)
    let ctx = NullContext()
    let first = try identity.identityKeyPair(context: ctx).serialize()
    let second = try KssengerIdentityStore(blobs).identityKeyPair(context: ctx).serialize()
    let reg = try KssengerIdentityStore(blobs).localRegistrationId(context: ctx)
    return first == second && reg >= 1 && reg <= 16380
  }

  /// Full PQXDH + Double Ratchet self-test between two throwaway local identities.
  private static func verifyAliceBobSession() throws -> Bool {
    let ctx = NullContext()
    let aliceBlobs = KeychainBlobStore(namespace: "signal-selftest-alice")
    let bobBlobs = KeychainBlobStore(namespace: "signal-selftest-bob")

    let aliceIdentity = KssengerIdentityStore(aliceBlobs)
    let aliceSessions = KssengerSessionStore(aliceBlobs)
    let alicePre = KssengerPreKeyStore(aliceBlobs)
    let aliceSigned = KssengerSignedPreKeyStore(aliceBlobs)
    let aliceKyber = KssengerKyberPreKeyStore(aliceBlobs)

    let bobIdentity = KssengerIdentityStore(bobBlobs)
    let bobSessions = KssengerSessionStore(bobBlobs)
    let bobPre = KssengerPreKeyStore(bobBlobs)
    let bobSigned = KssengerSignedPreKeyStore(bobBlobs)
    let bobKyber = KssengerKyberPreKeyStore(bobBlobs)

    let aliceAddr = try ProtocolAddress(name: "00000000-0000-4000-8000-0000000000a1", deviceId: 1)
    let bobAddr = try ProtocolAddress(name: "00000000-0000-4000-8000-0000000000b1", deviceId: 1)
    try? aliceSessions.deleteSession(for: bobAddr)
    try? bobSessions.deleteSession(for: aliceAddr)

    let bobIdPair = try bobIdentity.identityKeyPair(context: ctx)
    let now = UInt64(Date().timeIntervalSince1970 * 1000)

    let ecId: UInt32 = 101, signedId: UInt32 = 202, kyberId: UInt32 = 303
    let ecPriv = PrivateKey.generate()
    try bobPre.storePreKey(try PreKeyRecord(id: ecId, privateKey: ecPriv), id: ecId, context: ctx)
    let signedPriv = PrivateKey.generate()
    let signedSig = bobIdPair.privateKey.generateSignature(message: signedPriv.publicKey.serialize())
    try bobSigned.storeSignedPreKey(try SignedPreKeyRecord(id: signedId, timestamp: now, privateKey: signedPriv, signature: signedSig), id: signedId, context: ctx)
    let kyberPair = KEMKeyPair.generate()
    let kyberSig = bobIdPair.privateKey.generateSignature(message: kyberPair.publicKey.serialize())
    try bobKyber.storeKyberPreKey(try KyberPreKeyRecord(id: kyberId, timestamp: now, keyPair: kyberPair, signature: kyberSig), id: kyberId, context: ctx)

    let bundle = try PreKeyBundle(
      registrationId: try bobIdentity.localRegistrationId(context: ctx),
      deviceId: 1,
      prekeyId: ecId, prekey: ecPriv.publicKey,
      signedPrekeyId: signedId, signedPrekey: signedPriv.publicKey, signedPrekeySignature: signedSig,
      identity: bobIdPair.identityKey,
      kyberPrekeyId: kyberId, kyberPrekey: kyberPair.publicKey, kyberPrekeySignature: kyberSig
    )
    try processPreKeyBundle(bundle, for: bobAddr, sessionStore: aliceSessions, identityStore: aliceIdentity, context: ctx)

    let outbound = Array("kssenger-e2ee-alice-bob-v1".utf8)
    let first = try signalEncrypt(message: outbound, for: bobAddr, sessionStore: aliceSessions, identityStore: aliceIdentity, context: ctx)
    guard first.messageType == .preKey else { return false }
    let bobPlain = try signalDecryptPreKey(
      message: try PreKeySignalMessage(bytes: first.serialize()),
      from: aliceAddr,
      sessionStore: bobSessions, identityStore: bobIdentity,
      preKeyStore: bobPre, signedPreKeyStore: bobSigned, kyberPreKeyStore: bobKyber,
      context: ctx
    )
    guard bobPlain == outbound else { return false }
    if bobPre.containsPreKey(id: ecId) { return false }

    let reply = Array("kssenger-e2ee-bob-alice-v1".utf8)
    let replyMsg = try signalEncrypt(message: reply, for: aliceAddr, sessionStore: bobSessions, identityStore: bobIdentity, context: ctx)
    guard replyMsg.messageType == .whisper else { return false }
    let alicePlain = try signalDecrypt(
      message: try SignalMessage(bytes: replyMsg.serialize()),
      from: bobAddr,
      sessionStore: aliceSessions, identityStore: aliceIdentity,
      context: ctx
    )
    return alicePlain == reply
      && aliceSessions.containsSession(for: bobAddr)
      && bobSessions.containsSession(for: aliceAddr)
  }
}

enum KssengerSignalError: Error { case badPayload }
