package com.kahdigital.kssenger.signal

import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.state.SignedPreKeyRecord
import org.signal.libsignal.protocol.state.SignedPreKeyStore

/** Native encrypted persistence for official libsignal signed prekeys. */
internal class SignalSignedPreKeyStore(
  private val blobs: KeystoreBlobStore,
) : SignedPreKeyStore {
  private val indexKey = "signed-prekeys:index"

  override fun loadSignedPreKey(signedPreKeyId: Int): SignedPreKeyRecord {
    val serialized = blobs.get(key(signedPreKeyId))
      ?: throw InvalidKeyIdException("Missing signed prekey $signedPreKeyId")
    return SignedPreKeyRecord(serialized)
  }

  override fun loadSignedPreKeys(): MutableList<SignedPreKeyRecord> =
    loadIndex().mapTo(mutableListOf()) { loadSignedPreKey(it) }

  override fun storeSignedPreKey(signedPreKeyId: Int, record: SignedPreKeyRecord) {
    require(signedPreKeyId >= 0) { "INVALID_SIGNED_PREKEY_ID" }
    require(record.id == signedPreKeyId) { "SIGNED_PREKEY_ID_MISMATCH" }
    blobs.put(key(signedPreKeyId), record.serialize())
    writeIndex(loadIndex() + signedPreKeyId)
  }

  override fun containsSignedPreKey(signedPreKeyId: Int): Boolean = blobs.contains(key(signedPreKeyId))

  override fun removeSignedPreKey(signedPreKeyId: Int) {
    blobs.remove(key(signedPreKeyId))
    writeIndex(loadIndex() - signedPreKeyId)
  }

  private fun key(id: Int) = "signed-prekey:$id"

  private fun loadIndex(): Set<Int> = blobs.get(indexKey)
    ?.toString(Charsets.UTF_8)
    ?.split(',')
    ?.mapNotNull { it.toIntOrNull() }
    ?.filter { it >= 0 }
    ?.toSet()
    ?: emptySet()

  private fun writeIndex(ids: Set<Int>) {
    if (ids.isEmpty()) blobs.remove(indexKey)
    else blobs.put(indexKey, ids.sorted().joinToString(",").toByteArray(Charsets.UTF_8))
  }
}
