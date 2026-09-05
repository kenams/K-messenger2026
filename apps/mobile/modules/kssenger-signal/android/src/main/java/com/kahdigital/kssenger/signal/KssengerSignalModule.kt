package com.kahdigital.kssenger.signal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.state.SessionRecord

private const val STORE_PROBE_KEY = "__probe__"
private const val SESSION_PROBE_NAME = "00000000-0000-4000-8000-000000000001"
private const val SESSION_PROBE_DEVICE = 1

class KssengerSignalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KssengerSignalBridge")

    AsyncFunction("getStatus") {
      val libsignalLoaded = runCatching {
        Class.forName("org.signal.libsignal.protocol.IdentityKeyPair")
        Class.forName("org.signal.libsignal.protocol.state.SessionStore")
        Class.forName("org.signal.libsignal.protocol.state.IdentityKeyStore")
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

      mapOf(
        "libsignalLoaded" to libsignalLoaded,
        "secureStorageReady" to nativeStoreReady,
        "deviceKeyStoreReady" to nativeStoreReady,
        "sessionStoreReady" to sessionStoreReady,
        // This remains false until identity/prekey/PQ stores are wired and a
        // real Alice/Bob libsignal session performs encrypt/decrypt natively.
        "selfTestPassed" to false,
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
}
