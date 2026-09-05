package com.kahdigital.kssenger.signal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.SessionBuilder
import org.signal.libsignal.protocol.SessionCipher
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyType
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyBundle
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord

private const val STORE_PROBE_KEY = "__probe__"
private const val SESSION_PROBE_NAME = "00000000-0000-4000-8000-000000000001"
private const val SESSION_PROBE_DEVICE = 1
private const val SELFTEST_ALICE = "00000000-0000-4000-8000-0000000000a1"
private const val SELFTEST_BOB = "00000000-0000-4000-8000-0000000000b1"

class KssengerSignalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KssengerSignalBridge")

    AsyncFunction("getStatus") {
      val libsignalLoaded = runCatching {
        Class.forName("org.signal.libsignal.protocol.IdentityKeyPair")
        Class.forName("org.signal.libsignal.protocol.SessionBuilder")
        Class.forName("org.signal.libsignal.protocol.SessionCipher")
        Class.forName("org.signal.libsignal.protocol.state.SessionStore")
        Class.forName("org.signal.libsignal.protocol.state.IdentityKeyStore")
        Class.forName("org.signal.libsignal.protocol.state.PreKeyStore")
        Class.forName("org.signal.libsignal.protocol.state.SignedPreKeyStore")
        Class.forName("org.signal.libsignal.protocol.state.KyberPreKeyStore")
        true
      }.getOrDefault(false)

      val context = appContext.reactContext
      val nativeStore = context?.let { KeystoreBlobStore(it) }
      val nativeStoreReady = nativeStore != null && runCatching {
        verifyPersistentEncryptedStore(nativeStore)
      }.getOrDefault(false)
      val sessionStoreReady = libsignalLoaded && nativeStoreReady && nativeStore != null && runCatching {
        verifyOfficialSessionStore(SignalSessionStore(nativeStore))
      }.getOrDefault(false)
      val deviceKeyStoreReady = libsignalLoaded && nativeStoreReady && nativeStore != null && runCatching {
        verifyDeviceStores(nativeStore)
      }.getOrDefault(false)
      val selfTestPassed = libsignalLoaded && nativeStoreReady && context != null && runCatching {
        verifyAliceBobSession(context)
      }.getOrDefault(false)

      mapOf(
        "libsignalLoaded" to libsignalLoaded,
        "secureStorageReady" to nativeStoreReady,
        "deviceKeyStoreReady" to deviceKeyStoreReady,
        "sessionStoreReady" to sessionStoreReady,
        "selfTestPassed" to selfTestPassed,
      )
    }
  }

  private fun verifyPersistentEncryptedStore(store: KeystoreBlobStore): Boolean {
    val clear = "kssenger-native-store-probe-v1".toByteArray(Charsets.UTF_8)
    store.put(STORE_PROBE_KEY, clear)
    val roundTrip = store.get(STORE_PROBE_KEY)
    store.remove(STORE_PROBE_KEY)
    return roundTrip?.contentEquals(clear) == true && !store.contains(STORE_PROBE_KEY)
  }

  private fun verifyOfficialSessionStore(store: SignalSessionStore): Boolean {
    val address = SignalProtocolAddress(SESSION_PROBE_NAME, SESSION_PROBE_DEVICE)
    store.deleteSession(address)

    val original = SessionRecord()
    val serialized = original.serialize()
    store.storeSession(address, original)

    val loaded = store.loadSession(address).serialize()
    val contains = store.containsSession(address)
    val indexed = store.getSubDeviceSessions(SESSION_PROBE_NAME).contains(SESSION_PROBE_DEVICE)

    store.deleteSession(address)
    val cleaned = !store.containsSession(address) &&
      !store.getSubDeviceSessions(SESSION_PROBE_NAME).contains(SESSION_PROBE_DEVICE)

    return contains && indexed && serialized.contentEquals(loaded) && cleaned
  }

  private fun verifyDeviceStores(store: KeystoreBlobStore): Boolean {
    val identity = SignalIdentityKeyStore(store)
    val firstPair = identity.identityKeyPair.serialize()
    val firstRegistration = identity.localRegistrationId
    val secondPair = SignalIdentityKeyStore(store).identityKeyPair.serialize()
    val secondRegistration = SignalIdentityKeyStore(store).localRegistrationId

    SignalPreKeyStore(store)
    SignalSignedPreKeyStore(store)
    SignalKyberPreKeyStore(store)

    return firstPair.contentEquals(secondPair) &&
      firstRegistration == secondRegistration &&
      firstRegistration in 1..16380
  }

  /**
   * Executes the official libsignal session path entirely in native Android:
   * Bob publishes EC + signed + Kyber prekeys, Alice processes a PQXDH bundle,
   * Alice encrypts a first PreKeySignalMessage, Bob decrypts it (consuming the
   * one-time prekeys), then Bob replies with a normal SignalMessage and Alice
   * decrypts it. All persistent protocol records are protected by Android
   * Keystore through the adapters above.
   */
  private fun verifyAliceBobSession(context: android.content.Context): Boolean {
    val aliceBlobs = KeystoreBlobStore(context, "signal-selftest-alice")
    val bobBlobs = KeystoreBlobStore(context, "signal-selftest-bob")

    val aliceIdentity = SignalIdentityKeyStore(aliceBlobs)
    val aliceSessions = SignalSessionStore(aliceBlobs)
    val alicePreKeys = SignalPreKeyStore(aliceBlobs)
    val aliceSigned = SignalSignedPreKeyStore(aliceBlobs)
    val aliceKyber = SignalKyberPreKeyStore(aliceBlobs)

    val bobIdentity = SignalIdentityKeyStore(bobBlobs)
    val bobSessions = SignalSessionStore(bobBlobs)
    val bobPreKeys = SignalPreKeyStore(bobBlobs)
    val bobSigned = SignalSignedPreKeyStore(bobBlobs)
    val bobKyber = SignalKyberPreKeyStore(bobBlobs)

    val aliceAddress = SignalProtocolAddress(SELFTEST_ALICE, 1)
    val bobAddress = SignalProtocolAddress(SELFTEST_BOB, 1)
    aliceSessions.deleteSession(bobAddress)
    bobSessions.deleteSession(aliceAddress)

    val bobPair: IdentityKeyPair = bobIdentity.identityKeyPair
    val ecPreKeyId = 101
    val signedPreKeyId = 202
    val kyberPreKeyId = 303

    val ecPair = ECKeyPair.generate()
    val ecRecord = PreKeyRecord(ecPreKeyId, ecPair)
    bobPreKeys.storePreKey(ecPreKeyId, ecRecord)

    val signedPair = ECKeyPair.generate()
    val signedSignature = bobPair.privateKey.calculateSignature(signedPair.publicKey.serialize())
    val signedRecord = SignedPreKeyRecord(
      signedPreKeyId,
      System.currentTimeMillis(),
      signedPair,
      signedSignature,
    )
    bobSigned.storeSignedPreKey(signedPreKeyId, signedRecord)

    val kyberPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
    val kyberSignature = bobPair.privateKey.calculateSignature(kyberPair.publicKey.serialize())
    val kyberRecord = KyberPreKeyRecord(
      kyberPreKeyId,
      System.currentTimeMillis(),
      kyberPair,
      kyberSignature,
    )
    bobKyber.storeKyberPreKey(kyberPreKeyId, kyberRecord)

    val bundle = PreKeyBundle(
      bobIdentity.localRegistrationId,
      1,
      ecPreKeyId,
      ecPair.publicKey,
      signedPreKeyId,
      signedPair.publicKey,
      signedSignature,
      bobPair.publicKey,
      kyberPreKeyId,
      kyberPair.publicKey,
      kyberSignature,
    )

    SessionBuilder(
      aliceSessions,
      alicePreKeys,
      aliceSigned,
      aliceIdentity,
      bobAddress,
      aliceAddress,
    ).process(bundle)

    val aliceCipher = SessionCipher(
      aliceSessions,
      alicePreKeys,
      aliceSigned,
      aliceKyber,
      aliceIdentity,
      aliceAddress,
      bobAddress,
    )
    val bobCipher = SessionCipher(
      bobSessions,
      bobPreKeys,
      bobSigned,
      bobKyber,
      bobIdentity,
      bobAddress,
      aliceAddress,
    )

    val outbound = "kssenger-e2ee-alice-bob-v1".toByteArray(Charsets.UTF_8)
    val firstCiphertext = aliceCipher.encrypt(outbound)
    if (firstCiphertext !is PreKeySignalMessage) return false
    val bobPlaintext = bobCipher.decrypt(firstCiphertext)
    if (!outbound.contentEquals(bobPlaintext)) return false
    if (bobPreKeys.containsPreKey(ecPreKeyId)) return false
    if (bobKyber.containsKyberPreKey(kyberPreKeyId)) return false

    val reply = "kssenger-e2ee-bob-alice-v1".toByteArray(Charsets.UTF_8)
    val replyCiphertext = bobCipher.encrypt(reply)
    if (replyCiphertext !is SignalMessage) return false
    val alicePlaintext = aliceCipher.decrypt(replyCiphertext)

    return reply.contentEquals(alicePlaintext) &&
      aliceSessions.containsSession(bobAddress) &&
      bobSessions.containsSession(aliceAddress)
  }
}
