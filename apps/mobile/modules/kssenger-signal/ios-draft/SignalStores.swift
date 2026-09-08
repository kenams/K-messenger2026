import Foundation
import LibSignalClient
import CryptoKit

/// LibSignalClient store implementations backed by `KeychainBlobStore`.
///
/// Mirrors the Android store classes 1:1 (key names, TOFU identity policy,
/// device index for sessions, last-resort replay markers). No custom
/// cryptography — only opaque serialized libsignal records are persisted.
///
/// NOTE: written without a macOS/Xcode toolchain. The LibSignalClient Swift
/// store protocols take `context: StoreContext` and are `throws`; method
/// signatures below follow the 0.x Swift API and may need small adjustments on
/// first compile against the pinned `LibSignalClient` version.

private func sha256Hex(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func sha256UrlBase64(_ data: Data) -> String {
  Data(SHA256.hash(data: data))
    .base64EncodedString()
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
}

// MARK: - Identity

final class KssengerIdentityStore: IdentityKeyStore {
  private let blobs: KeychainBlobStore
  private let pairKey = "identity:local-pair"
  private let registrationKey = "identity:registration-id"

  init(_ blobs: KeychainBlobStore) { self.blobs = blobs }

  func identityKeyPair(context: StoreContext) throws -> IdentityKeyPair {
    if let existing = try blobs.get(pairKey) {
      return try IdentityKeyPair(bytes: existing)
    }
    let generated = IdentityKeyPair.generate()
    try blobs.put(pairKey, Data(generated.serialize()))
    return generated
  }

  func localRegistrationId(context: StoreContext) throws -> UInt32 {
    if let raw = try blobs.get(registrationKey),
       let text = String(data: raw, encoding: .utf8),
       let value = UInt32(text), value >= 1, value <= 16380 {
      return value
    }
    let generated = UInt32.random(in: 1...16380)
    try blobs.put(registrationKey, Data("\(generated)".utf8))
    return generated
  }

  private func remoteKey(_ address: ProtocolAddress) -> String {
    let raw = Data("\(address.name):\(address.deviceId)".utf8)
    return "identity:remote:\(sha256Hex(raw))"
  }

  func saveIdentity(_ identity: IdentityKey, for address: ProtocolAddress, context: StoreContext) throws -> Bool {
    let key = remoteKey(address)
    let previous = try blobs.get(key).flatMap { try? IdentityKey(bytes: $0) }
    try blobs.put(key, Data(identity.serialize()))
    // Return value convention in LibSignalClient Swift: true == identity changed.
    if let previous, previous != identity { return true }
    return false
  }

  func isTrustedIdentity(_ identity: IdentityKey, for address: ProtocolAddress, direction: Direction, context: StoreContext) throws -> Bool {
    guard let saved = try self.identity(for: address, context: context) else { return true }
    return saved == identity
  }

  func identity(for address: ProtocolAddress, context: StoreContext) throws -> IdentityKey? {
    guard let bytes = try blobs.get(remoteKey(address)) else { return nil }
    return try IdentityKey(bytes: bytes)
  }
}

// MARK: - Session

final class KssengerSessionStore: SessionStore {
  private let blobs: KeychainBlobStore
  init(_ blobs: KeychainBlobStore) { self.blobs = blobs }

  private func nameDigest(_ name: String) -> String { sha256UrlBase64(Data(name.utf8)) }
  private func sessionKey(_ address: ProtocolAddress) -> String { "session:\(nameDigest(address.name)):\(address.deviceId)" }
  private func indexKey(_ name: String) -> String { "session-index:\(nameDigest(name))" }

  private func readIndex(_ name: String) -> [UInt32] {
    guard let raw = try? blobs.get(indexKey(name)), let raw,
          let text = String(data: raw, encoding: .utf8), !text.isEmpty else { return [] }
    return text.split(separator: ",").compactMap { UInt32($0) }.filter { $0 >= 1 && $0 <= 127 }
  }

  private func writeIndex(_ name: String, _ devices: Set<UInt32>) throws {
    if devices.isEmpty { try blobs.remove(indexKey(name)); return }
    let encoded = devices.sorted().map(String.init).joined(separator: ",")
    try blobs.put(indexKey(name), Data(encoded.utf8))
  }

  func loadSession(for address: ProtocolAddress, context: StoreContext) throws -> SessionRecord? {
    guard let bytes = try blobs.get(sessionKey(address)) else { return nil }
    return try SessionRecord(bytes: bytes)
  }

  func loadExistingSessions(for addresses: [ProtocolAddress], context: StoreContext) throws -> [SessionRecord] {
    try addresses.map { address in
      guard let record = try loadSession(for: address, context: context) else {
        throw SignalError.sessionNotFound("No session for \(address)")
      }
      return record
    }
  }

  func storeSession(_ record: SessionRecord, for address: ProtocolAddress, context: StoreContext) throws {
    try blobs.put(sessionKey(address), Data(record.serialize()))
    var devices = Set(readIndex(address.name))
    if devices.insert(address.deviceId).inserted { try writeIndex(address.name, devices) }
  }

  // Helpers mirroring the Android extra methods (used by clearDeviceState / probes).
  func containsSession(for address: ProtocolAddress) -> Bool { blobs.contains(sessionKey(address)) }

  func deleteSession(for address: ProtocolAddress) throws {
    try blobs.remove(sessionKey(address))
    var devices = Set(readIndex(address.name))
    if devices.remove(address.deviceId) != nil { try writeIndex(address.name, devices) }
  }

  func subDeviceSessions(for name: String) -> [UInt32] { readIndex(name) }
}

// MARK: - PreKey (one-time EC)

final class KssengerPreKeyStore: PreKeyStore {
  private let blobs: KeychainBlobStore
  init(_ blobs: KeychainBlobStore) { self.blobs = blobs }
  private func key(_ id: UInt32) -> String { "prekey:\(id)" }

  func loadPreKey(id: UInt32, context: StoreContext) throws -> PreKeyRecord {
    guard let bytes = try blobs.get(key(id)) else { throw SignalError.invalidKeyIdentifier("Missing prekey \(id)") }
    return try PreKeyRecord(bytes: bytes)
  }

  func storePreKey(_ record: PreKeyRecord, id: UInt32, context: StoreContext) throws {
    try blobs.put(key(id), Data(record.serialize()))
  }

  func removePreKey(id: UInt32, context: StoreContext) throws {
    try blobs.remove(key(id))
  }

  func containsPreKey(id: UInt32) -> Bool { blobs.contains(key(id)) }
}

// MARK: - Signed PreKey

final class KssengerSignedPreKeyStore: SignedPreKeyStore {
  private let blobs: KeychainBlobStore
  private let indexKey = "signed-prekeys:index"
  init(_ blobs: KeychainBlobStore) { self.blobs = blobs }
  private func key(_ id: UInt32) -> String { "signed-prekey:\(id)" }

  private func loadIndex() -> Set<UInt32> {
    guard let raw = try? blobs.get(indexKey), let raw, let text = String(data: raw, encoding: .utf8) else { return [] }
    return Set(text.split(separator: ",").compactMap { UInt32($0) })
  }
  private func writeIndex(_ ids: Set<UInt32>) throws {
    if ids.isEmpty { try blobs.remove(indexKey); return }
    try blobs.put(indexKey, Data(ids.sorted().map(String.init).joined(separator: ",").utf8))
  }

  func loadSignedPreKey(id: UInt32, context: StoreContext) throws -> SignedPreKeyRecord {
    guard let bytes = try blobs.get(key(id)) else { throw SignalError.invalidKeyIdentifier("Missing signed prekey \(id)") }
    return try SignedPreKeyRecord(bytes: bytes)
  }

  func storeSignedPreKey(_ record: SignedPreKeyRecord, id: UInt32, context: StoreContext) throws {
    try blobs.put(key(id), Data(record.serialize()))
    var ids = loadIndex(); ids.insert(id); try writeIndex(ids)
  }
}

// MARK: - Kyber PreKey (PQXDH)

final class KssengerKyberPreKeyStore: KyberPreKeyStore {
  private let blobs: KeychainBlobStore
  private let indexKey = "kyber-prekeys:index"
  private let lastResortIndexKey = "kyber-prekeys:last-resort"
  init(_ blobs: KeychainBlobStore) { self.blobs = blobs }
  private func key(_ id: UInt32) -> String { "kyber-prekey:\(id)" }

  private func loadIndex(_ name: String) -> Set<UInt32> {
    guard let raw = try? blobs.get(name), let raw, let text = String(data: raw, encoding: .utf8) else { return [] }
    return Set(text.split(separator: ",").compactMap { UInt32($0) })
  }
  private func writeIndex(_ name: String, _ ids: Set<UInt32>) throws {
    if ids.isEmpty { try blobs.remove(name); return }
    try blobs.put(name, Data(ids.sorted().map(String.init).joined(separator: ",").utf8))
  }

  func loadKyberPreKey(id: UInt32, context: StoreContext) throws -> KyberPreKeyRecord {
    guard let bytes = try blobs.get(key(id)) else { throw SignalError.invalidKeyIdentifier("Missing Kyber prekey \(id)") }
    return try KyberPreKeyRecord(bytes: bytes)
  }

  func storeKyberPreKey(_ record: KyberPreKeyRecord, id: UInt32, context: StoreContext) throws {
    try blobs.put(key(id), Data(record.serialize()))
    var ids = loadIndex(indexKey); ids.insert(id); try writeIndex(indexKey, ids)
  }

  func markKyberPreKeyUsed(id: UInt32, context: StoreContext) throws {
    guard blobs.contains(key(id)) else { throw SignalError.invalidKeyIdentifier("Missing Kyber prekey \(id)") }
    if !loadIndex(lastResortIndexKey).contains(id) {
      // One-time key: consume it.
      try blobs.remove(key(id))
      var ids = loadIndex(indexKey); ids.remove(id); try writeIndex(indexKey, ids)
    }
    // Last-resort keys are retained. The 0.x Swift API drops the explicit
    // (signedPreKeyId, baseKey) replay-marker parameters the Java API exposes;
    // libsignal enforces last-resort replay protection internally.
  }

  func storeLastResortKyberPreKey(_ record: KyberPreKeyRecord, id: UInt32, context: StoreContext) throws {
    try storeKyberPreKey(record, id: id, context: context)
    var ids = loadIndex(lastResortIndexKey); ids.insert(id); try writeIndex(lastResortIndexKey, ids)
  }
}
