package com.kahdigital.kssenger.signal

import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyStore

/** Native encrypted persistence for official libsignal one-time EC prekeys. */
internal class SignalPreKeyStore(
  private val blobs: KeystoreBlobStore,
) : PreKeyStore {
  override fun loadPreKey(preKeyId: Int): PreKeyRecord {
    val serialized = blobs.get(key(preKeyId))
      ?: throw InvalidKeyIdException("Missing prekey $preKeyId")
    return PreKeyRecord(serialized)
  }

  override fun storePreKey(preKeyId: Int, record: PreKeyRecord) {
    require(preKeyId >= 0) { "INVALID_PREKEY_ID" }
    require(record.id == preKeyId) { "PREKEY_ID_MISMATCH" }
    blobs.put(key(preKeyId), record.serialize())
  }

  override fun containsPreKey(preKeyId: Int): Boolean = blobs.contains(key(preKeyId))

  override fun removePreKey(preKeyId: Int) {
    blobs.remove(key(preKeyId))
  }

  private fun key(id: Int) = "prekey:$id"
}
