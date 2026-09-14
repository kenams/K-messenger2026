package com.kahdigital.kssenger.signal

import java.security.MessageDigest
import java.security.SecureRandom
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.state.IdentityKeyStore

/**
 * Native-only TOFU identity persistence for official libsignal.
 * Local private identity bytes are encrypted at rest behind Android Keystore and
 * are never returned through the Expo/JS bridge.
 */
internal class SignalIdentityKeyStore(
  private val blobs: KeystoreBlobStore,
) : IdentityKeyStore {
  private val pairKey = "identity:local-pair"
  private val registrationKey = "identity:registration-id"

  override fun getIdentityKeyPair(): IdentityKeyPair {
    val existing = blobs.get(pairKey)
    if (existing != null) return IdentityKeyPair(existing)

    val generated = IdentityKeyPair.generate()
    blobs.put(pairKey, generated.serialize())
    return generated
  }

  override fun getLocalRegistrationId(): Int {
    val existing = blobs.get(registrationKey)?.toString(Charsets.UTF_8)?.toIntOrNull()
    if (existing != null && existing in 1..16380) return existing

    val generated = SecureRandom().nextInt(16380) + 1
    blobs.put(registrationKey, generated.toString().toByteArray(Charsets.UTF_8))
    return generated
  }

  override fun saveIdentity(
    address: SignalProtocolAddress,
    identityKey: IdentityKey,
  ): IdentityKeyStore.IdentityChange {
    val key = remoteKey(address)
    val previous = blobs.get(key)?.let { IdentityKey(it) }
    blobs.put(key, identityKey.serialize())
    return if (previous != null && previous != identityKey) {
      IdentityKeyStore.IdentityChange.REPLACED_EXISTING
    } else {
      IdentityKeyStore.IdentityChange.NEW_OR_UNCHANGED
    }
  }

  override fun isTrustedIdentity(
    address: SignalProtocolAddress,
    identityKey: IdentityKey,
    direction: IdentityKeyStore.Direction,
  ): Boolean {
    val saved = getIdentity(address)
    return saved == null || saved == identityKey
  }

  override fun getIdentity(address: SignalProtocolAddress): IdentityKey? =
    blobs.get(remoteKey(address))?.let { IdentityKey(it) }

  private fun remoteKey(address: SignalProtocolAddress): String {
    val raw = "${address.name}:${address.deviceId}".toByteArray(Charsets.UTF_8)
    val digest = MessageDigest.getInstance("SHA-256").digest(raw)
    val hex = digest.joinToString("") { "%02x".format(it) }
    return "identity:remote:$hex"
  }
}
