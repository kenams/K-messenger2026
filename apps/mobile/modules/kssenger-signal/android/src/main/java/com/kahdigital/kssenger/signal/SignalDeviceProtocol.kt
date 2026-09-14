package com.kahdigital.kssenger.signal

import android.content.Context
import android.util.Base64
import java.security.SecureRandom
import java.util.UUID
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.SessionBuilder
import org.signal.libsignal.protocol.SessionCipher
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECKeyPair
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.kem.KEMKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyType
import org.signal.libsignal.protocol.kem.KEMPublicKey
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyBundle
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord

internal class SignalDeviceProtocol(
  context: Context,
  deviceUuid: String,
) {
  private val normalizedDeviceUuid = UUID.fromString(deviceUuid).toString()
  private val blobs = KeystoreBlobStore(context, "signal-device-$normalizedDeviceUuid")
  private val identity = SignalIdentityKeyStore(blobs)
  private val sessions = SignalSessionStore(blobs)
  private val preKeys = SignalPreKeyStore(blobs)
  private val signedPreKeys = SignalSignedPreKeyStore(blobs)
  private val kyberPreKeys = SignalKyberPreKeyStore(blobs)
  private val random = SecureRandom()

  fun provision(oneTimeCount: Int = 20): Map<String, Any> {
    require(oneTimeCount in 10..100) { "INVALID_PREKEY_COUNT" }
    val identityPair = identity.identityKeyPair
    val signedId = nextKeyId()
    val signedPair = ECKeyPair.generate()
    val signedSignature = identityPair.privateKey.calculateSignature(signedPair.publicKey.serialize())
    signedPreKeys.storeSignedPreKey(
      signedId,
      SignedPreKeyRecord(signedId, System.currentTimeMillis(), signedPair, signedSignature),
    )

    val lastResortId = nextKeyId(setOf(signedId))
    val lastResortPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
    val lastResortSignature = identityPair.privateKey.calculateSignature(lastResortPair.publicKey.serialize())
    kyberPreKeys.storeLastResortKyberPreKey(
      lastResortId,
      KyberPreKeyRecord(lastResortId, System.currentTimeMillis(), lastResortPair, lastResortSignature),
    )

    val usedIds = mutableSetOf(signedId, lastResortId)
    val ecPublic = mutableListOf<Map<String, Any>>()
    val pqPublic = mutableListOf<Map<String, Any>>()
    repeat(oneTimeCount) {
      val ecId = nextKeyId(usedIds).also(usedIds::add)
      val ecPair = ECKeyPair.generate()
      preKeys.storePreKey(ecId, PreKeyRecord(ecId, ecPair))
      ecPublic += mapOf("keyId" to ecId, "publicKey" to b64(ecPair.publicKey.serialize()))

      val pqId = nextKeyId(usedIds).also(usedIds::add)
      val pqPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
      val pqSignature = identityPair.privateKey.calculateSignature(pqPair.publicKey.serialize())
      kyberPreKeys.storeKyberPreKey(
        pqId,
        KyberPreKeyRecord(pqId, System.currentTimeMillis(), pqPair, pqSignature),
      )
      pqPublic += mapOf(
        "keyId" to pqId,
        "publicKey" to b64(pqPair.publicKey.serialize()),
        "signature" to b64(pqSignature),
      )
    }

    val bundleVersion = ((System.currentTimeMillis() / 1000L) and 0x7fffffffL).toInt().coerceAtLeast(1)
    return mapOf(
      "bundleVersion" to bundleVersion,
      "registrationId" to identity.localRegistrationId,
      "identityKey" to b64(identityPair.publicKey.serialize()),
      "signedPreKeyId" to signedId,
      "signedPreKeyPublic" to b64(signedPair.publicKey.serialize()),
      "signedPreKeySignature" to b64(signedSignature),
      "pqLastResortPreKeyId" to lastResortId,
      "pqLastResortPreKeyPublic" to b64(lastResortPair.publicKey.serialize()),
      "pqLastResortPreKeySignature" to b64(lastResortSignature),
      "oneTimePreKeys" to ecPublic,
      "pqOneTimePreKeys" to pqPublic,
    )
  }

  fun processRemoteBundle(
    localUserId: String,
    localSignalDeviceId: Int,
    remoteUserId: String,
    remoteSignalDeviceId: Int,
    registrationId: Int,
    identityKeyB64: String,
    signedPreKeyId: Int,
    signedPreKeyPublicB64: String,
    signedPreKeySignatureB64: String,
    oneTimePreKeyId: Int?,
    oneTimePreKeyPublicB64: String?,
    pqPreKeyId: Int,
    pqPreKeyPublicB64: String,
    pqPreKeySignatureB64: String,
  ) {
    val localAddress = address(localUserId, localSignalDeviceId)
    val remoteAddress = address(remoteUserId, remoteSignalDeviceId)
    val preKeyBytes = oneTimePreKeyPublicB64?.let(::decode)
    val bundle = PreKeyBundle(
      registrationId,
      remoteSignalDeviceId,
      oneTimePreKeyId ?: PreKeyBundle.NULL_PRE_KEY_ID,
      preKeyBytes?.let(::ECPublicKey),
      signedPreKeyId,
      ECPublicKey(decode(signedPreKeyPublicB64)),
      decode(signedPreKeySignatureB64),
      IdentityKey(decode(identityKeyB64)),
      pqPreKeyId,
      KEMPublicKey(decode(pqPreKeyPublicB64)),
      decode(pqPreKeySignatureB64),
    )
    SessionBuilder(sessions, preKeys, signedPreKeys, identity, remoteAddress, localAddress).process(bundle)
  }

  fun hasSession(remoteUserId: String, remoteSignalDeviceId: Int): Boolean =
    sessions.containsSession(address(remoteUserId, remoteSignalDeviceId))

  fun encrypt(
    localUserId: String,
    localSignalDeviceId: Int,
    remoteUserId: String,
    remoteSignalDeviceId: Int,
    plaintext: String,
  ): Map<String, Any> {
    require(plaintext.toByteArray(Charsets.UTF_8).size <= 64 * 1024) { "PLAINTEXT_TOO_LARGE" }
    val localAddress = address(localUserId, localSignalDeviceId)
    val remoteAddress = address(remoteUserId, remoteSignalDeviceId)
    val cipher = SessionCipher(
      sessions, preKeys, signedPreKeys, kyberPreKeys, identity, localAddress, remoteAddress,
    )
    val encrypted = cipher.encrypt(plaintext.toByteArray(Charsets.UTF_8))
    val kind = when (encrypted) {
      is PreKeySignalMessage -> "prekey"
      is SignalMessage -> "signal"
      else -> throw IllegalStateException("UNSUPPORTED_LIBSIGNAL_MESSAGE_TYPE")
    }
    return mapOf(
      "kind" to kind,
      "ciphertext" to b64(encrypted.serialize()),
      "algorithm" to "signal-libsignal-v3-pqxdh",
    )
  }

  fun decrypt(
    localUserId: String,
    localSignalDeviceId: Int,
    remoteUserId: String,
    remoteSignalDeviceId: Int,
    kind: String,
    ciphertextB64: String,
  ): String {
    val localAddress = address(localUserId, localSignalDeviceId)
    val remoteAddress = address(remoteUserId, remoteSignalDeviceId)
    val cipher = SessionCipher(
      sessions, preKeys, signedPreKeys, kyberPreKeys, identity, localAddress, remoteAddress,
    )
    val bytes = decode(ciphertextB64)
    require(bytes.size <= 2_000_000) { "CIPHERTEXT_TOO_LARGE" }
    val clear = when (kind) {
      "prekey" -> cipher.decrypt(PreKeySignalMessage(bytes))
      "signal" -> cipher.decrypt(SignalMessage(bytes))
      else -> throw IllegalArgumentException("UNSUPPORTED_LIBSIGNAL_MESSAGE_TYPE")
    }
    return clear.toString(Charsets.UTF_8)
  }

  private fun address(userId: String, deviceId: Int): SignalProtocolAddress {
    val normalizedUser = UUID.fromString(userId).toString()
    require(deviceId in 1..127) { "INVALID_SIGNAL_DEVICE_ID" }
    return SignalProtocolAddress(normalizedUser, deviceId)
  }

  private fun nextKeyId(excluded: Set<Int> = emptySet()): Int {
    repeat(1000) {
      val candidate = random.nextInt(Int.MAX_VALUE - 1) + 1
      if (!excluded.contains(candidate)) return candidate
    }
    throw IllegalStateException("PREKEY_ID_EXHAUSTED")
  }

  private fun b64(value: ByteArray): String = Base64.encodeToString(value, Base64.NO_WRAP)
  private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
}
