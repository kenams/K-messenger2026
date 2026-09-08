import Foundation
import Security

/// Native-only persistence for libsignal records on iOS.
///
/// Mirrors the Android `KeystoreBlobStore`. Records are stored as iOS Keychain
/// generic-password items, which the OS already encrypts at rest with hardware
/// protection. Record plaintext is never exposed to the React Native / JS
/// boundary. Access is limited to this device (`ThisDeviceOnly`) and to the
/// unlocked state (`AfterFirstUnlock`), matching the Android Keystore posture.
///
/// NOTE: written without a macOS/Xcode toolchain — expect to fix minor API
/// signatures on first compile. The store shape and semantics are final.
final class KeychainBlobStore {
  enum StoreError: Error {
    case invalidRecordKey
    case recordTooLarge
    case writeFailed(OSStatus)
    case deleteFailed(OSStatus)
    case corrupt
  }

  static let maxRecordBytes = 1024 * 1024

  private let namespace: String
  private let service: String

  init(namespace: String = "signal-v1") {
    self.namespace = namespace
    self.service = "kssenger-e2ee-\(namespace)"
  }

  private func validate(_ recordKey: String) throws {
    let pattern = "^[A-Za-z0-9._:-]{1,180}$"
    guard recordKey.range(of: pattern, options: .regularExpression) != nil else {
      throw StoreError.invalidRecordKey
    }
  }

  private func baseQuery(_ recordKey: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: recordKey,
    ]
  }

  func put(_ recordKey: String, _ cleartext: Data) throws {
    try validate(recordKey)
    guard cleartext.count <= Self.maxRecordBytes else { throw StoreError.recordTooLarge }

    var query = baseQuery(recordKey)
    let attributes: [String: Any] = [
      kSecValueData as String: cleartext,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]

    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess { return }
    if updateStatus == errSecItemNotFound {
      query.merge(attributes) { _, new in new }
      let addStatus = SecItemAdd(query as CFDictionary, nil)
      guard addStatus == errSecSuccess else { throw StoreError.writeFailed(addStatus) }
      return
    }
    throw StoreError.writeFailed(updateStatus)
  }

  func get(_ recordKey: String) throws -> Data? {
    var query = baseQuery(recordKey)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw StoreError.corrupt }
    return result as? Data
  }

  func contains(_ recordKey: String) -> Bool {
    (try? get(recordKey)) != nil && (try? get(recordKey)).flatMap { $0 } != nil
  }

  func remove(_ recordKey: String) throws {
    let status = SecItemDelete(baseQuery(recordKey) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw StoreError.deleteFailed(status)
    }
  }

  func removePrefix(_ prefix: String) throws {
    for key in allKeys() where key.hasPrefix(prefix) {
      try remove(key)
    }
  }

  /// Enumerate every account (record key) currently stored in this namespace.
  func allKeys() -> [String] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecMatchLimit as String: kSecMatchLimitAll,
      kSecReturnAttributes as String: true,
    ]
    query[kSecReturnData as String] = false

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let items = result as? [[String: Any]] else { return [] }
    return items.compactMap { $0[kSecAttrAccount as String] as? String }
  }

  /// Permanently erase every record in this namespace. Used only after a
  /// server-side account deletion has succeeded so old Signal identity/session
  /// material cannot survive as recoverable local state.
  func clearAndDestroyKey() throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
    ]
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw StoreError.deleteFailed(status)
    }
  }
}
