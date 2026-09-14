package com.kahdigital.kssenger.signal

/**
 * Device-local cache for plaintext that the local user already sees in the UI.
 *
 * The cache exists only so the sender can re-render their own historical
 * messages after an app restart. Records are persisted through
 * [KeystoreBlobStore], so at-rest plaintext never lives in JS storage or in the
 * K-ssenger server/database. This does not alter the Signal protocol or message
 * ciphertext sent over the network.
 */
internal class LocalMessageStore(private val blobs: KeystoreBlobStore) {
  fun put(userId: String, messageId: String, plaintext: String) {
    blobs.put(key(userId, messageId), plaintext.toByteArray(Charsets.UTF_8))
  }

  fun get(userId: String, messageId: String): String? =
    blobs.get(key(userId, messageId))?.toString(Charsets.UTF_8)

  fun remove(userId: String, messageId: String) {
    blobs.remove(key(userId, messageId))
  }

  private fun key(userId: String, messageId: String): String {
    val user = normalizedUuid(userId)
    val message = normalizedUuid(messageId)
    return "localmsg:$user:$message"
  }

  private fun normalizedUuid(value: String): String =
    java.util.UUID.fromString(value).toString()
}
