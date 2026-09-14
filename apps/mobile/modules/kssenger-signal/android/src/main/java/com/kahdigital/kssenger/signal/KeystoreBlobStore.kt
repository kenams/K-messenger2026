package com.kahdigital.kssenger.signal

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Native-only encrypted blob persistence for libsignal records.
 *
 * Record bytes are encrypted with an AES-256 key generated inside Android
 * Keystore. The key is non-exportable and record plaintext is never exposed to
 * the React Native / JavaScript boundary. The store is intentionally generic:
 * libsignal identity, prekey and session adapters can persist their opaque
 * serialized records here without K-ssenger interpreting or reimplementing the
 * cryptographic protocol.
 */
internal class KeystoreBlobStore(
  context: Context,
  private val namespace: String = "signal-v1",
) {
  private val preferences = context.getSharedPreferences("kssenger-e2ee-$namespace", Context.MODE_PRIVATE)
  private val keyAlias = "kssenger-e2ee-$namespace-aes-v1"

  fun put(recordKey: String, cleartext: ByteArray) {
    require(recordKey.matches(Regex("^[A-Za-z0-9._:-]{1,180}$"))) { "INVALID_RECORD_KEY" }
    require(cleartext.size <= MAX_RECORD_BYTES) { "RECORD_TOO_LARGE" }

    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val encrypted = cipher.doFinal(cleartext)
    val encoded = listOf(
      Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
      Base64.encodeToString(encrypted, Base64.NO_WRAP),
    ).joinToString(".")

    check(preferences.edit().putString(recordKey, encoded).commit()) { "STORE_WRITE_FAILED" }
  }

  fun get(recordKey: String): ByteArray? {
    val encoded = preferences.getString(recordKey, null) ?: return null
    val parts = encoded.split('.', limit = 2)
    if (parts.size != 2) throw IllegalStateException("STORE_RECORD_CORRUPT")

    val iv = Base64.decode(parts[0], Base64.NO_WRAP)
    val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
    if (iv.size != GCM_IV_BYTES || encrypted.isEmpty() || encrypted.size > MAX_RECORD_BYTES + 32) {
      throw IllegalStateException("STORE_RECORD_CORRUPT")
    }

    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
    return cipher.doFinal(encrypted)
  }

  fun remove(recordKey: String) {
    check(preferences.edit().remove(recordKey).commit()) { "STORE_DELETE_FAILED" }
  }

  fun removePrefix(prefix: String) {
    require(prefix.matches(Regex("^[A-Za-z0-9._:-]{1,180}$"))) { "INVALID_RECORD_PREFIX" }
    val keys = preferences.all.keys.filter { it.startsWith(prefix) }
    if (keys.isEmpty()) return
    val editor = preferences.edit()
    keys.forEach(editor::remove)
    check(editor.commit()) { "STORE_PREFIX_DELETE_FAILED" }
  }

  /**
   * Permanently erase every encrypted record in this namespace and destroy the
   * non-exportable Android Keystore key that protected them. This is used only
   * after a K-ssenger account deletion has succeeded server-side so old Signal
   * identity/session material cannot survive as recoverable local app state.
   */
  fun clearAndDestroyKey() {
    check(preferences.edit().clear().commit()) { "STORE_CLEAR_FAILED" }
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias)
  }

  fun contains(recordKey: String): Boolean = preferences.contains(recordKey)

  private fun getOrCreateKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }

    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        keyAlias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setKeySize(256)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }

  companion object {
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_BYTES = 12
    private const val MAX_RECORD_BYTES = 1024 * 1024
  }
}
