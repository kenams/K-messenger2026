package com.kahdigital.kssenger.signal

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val PROBE_ALIAS = "kssenger-e2ee-keystore-probe-v1"

class KssengerSignalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KssengerSignalBridge")

    AsyncFunction("getStatus") {
      val libsignalLoaded = runCatching {
        Class.forName("org.signal.libsignal.protocol.IdentityKeyPair")
        true
      }.getOrDefault(false)

      val secureStorageReady = runCatching { verifyAndroidKeystoreRoundTrip() }.getOrDefault(false)

      mapOf(
        "libsignalLoaded" to libsignalLoaded,
        "secureStorageReady" to secureStorageReady,
        // These deliberately remain false until K-ssenger implements persistent
        // libsignal identity/prekey/session stores and a real session self-test.
        "sessionStoreReady" to false,
        "deviceKeyStoreReady" to false,
        "selfTestPassed" to false
      )
    }
  }

  private fun verifyAndroidKeystoreRoundTrip(): Boolean {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!keyStore.containsAlias(PROBE_ALIAS)) {
      val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
      generator.init(
        KeyGenParameterSpec.Builder(
          PROBE_ALIAS,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setRandomizedEncryptionRequired(true)
          .build()
      )
      generator.generateKey()
    }

    val key = keyStore.getKey(PROBE_ALIAS, null) as? SecretKey ?: return false
    val clear = "kssenger-keystore-probe".toByteArray(Charsets.UTF_8)

    val encryptor = Cipher.getInstance("AES/GCM/NoPadding")
    encryptor.init(Cipher.ENCRYPT_MODE, key)
    val ciphertext = encryptor.doFinal(clear)
    val iv = encryptor.iv

    val decryptor = Cipher.getInstance("AES/GCM/NoPadding")
    decryptor.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
    return decryptor.doFinal(ciphertext).contentEquals(clear)
  }
}
