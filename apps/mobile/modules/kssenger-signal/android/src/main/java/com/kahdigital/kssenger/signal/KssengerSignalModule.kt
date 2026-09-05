package com.kahdigital.kssenger.signal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val STORE_PROBE_KEY = "__probe__"

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
      val nativeStoreReady = context != null && runCatching {
        verifyPersistentEncryptedStore(KeystoreBlobStore(context))
      }.getOrDefault(false)

      mapOf(
        "libsignalLoaded" to libsignalLoaded,
        "secureStorageReady" to nativeStoreReady,
        // The opaque encrypted native store is now ready to hold private
        // libsignal identity/prekey material without crossing into JavaScript.
        "deviceKeyStoreReady" to nativeStoreReady,
        // Deliberately false until the official libsignal SessionStore,
        // IdentityKeyStore, PreKeyStore, SignedPreKeyStore and KyberPreKeyStore
        // adapters are wired to KeystoreBlobStore and exercised end-to-end.
        "sessionStoreReady" to false,
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
}
