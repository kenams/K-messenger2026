import ExpoModulesCore
import Foundation

/// iOS port of the Android `KssengerLocalMessageModule` (bridge name
/// `KssengerLocalMessageBridge`). Device-local encrypted cache of plaintext the
/// local user already sees in the UI, so the sender can re-render their own
/// history after an app restart. Never touches network ciphertext or the
/// Signal protocol; persisted through the Keychain-backed blob store.
public class KssengerLocalMessageModule: Module {
  private let store = KeychainBlobStore(namespace: "local-messages-v1")

  public func definition() -> ModuleDefinition {
    Name("KssengerLocalMessageBridge")

    AsyncFunction("store") { (userId: String, messageId: String, plaintext: String) -> Bool in
      guard plaintext.utf8.count <= 256 * 1024 else { throw LocalMessageError.tooLarge }
      try self.store.put(try Self.key(userId, messageId), Data(plaintext.utf8))
      return true
    }

    AsyncFunction("load") { (userId: String, messageId: String) -> String? in
      guard let data = try self.store.get(try Self.key(userId, messageId)) else { return nil }
      return String(data: data, encoding: .utf8)
    }

    AsyncFunction("remove") { (userId: String, messageId: String) -> Bool in
      try self.store.remove(try Self.key(userId, messageId))
      return true
    }
  }

  private static func key(_ userId: String, _ messageId: String) throws -> String {
    guard let u = UUID(uuidString: userId), let m = UUID(uuidString: messageId) else {
      throw LocalMessageError.badId
    }
    return "localmsg:\(u.uuidString.lowercased()):\(m.uuidString.lowercased())"
  }
}

enum LocalMessageError: Error { case tooLarge, badId }
