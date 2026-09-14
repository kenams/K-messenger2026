package com.kahdigital.kssenger.signal

import java.security.MessageDigest
import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.ReusedBaseKeyException
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.KyberPreKeyStore

/**
 * Native encrypted persistence for official libsignal Kyber prekeys.
 *
 * One-time Kyber prekeys are removed on first use. Last-resort keys must be
 * explicitly marked by the provisioning layer; for those, libsignal requires
 * replay detection for the (kyber id, signed prekey id, base key) tuple.
 * Replay markers are encrypted at rest by KeystoreBlobStore.
 */
internal class SignalKyberPreKeyStore(
  private val blobs: KeystoreBlobStore,
) : KyberPreKeyStore {
  private val indexKey = "kyber-prekeys:index"
  private val lastResortIndexKey = "kyber-prekeys:last-resort"

  override fun loadKyberPreKey(kyberPreKeyId: Int): KyberPreKeyRecord {
    val serialized = blobs.get(key(kyberPreKeyId))
      ?: throw InvalidKeyIdException("Missing Kyber prekey $kyberPreKeyId")
    return KyberPreKeyRecord(serialized)
  }

  override fun loadKyberPreKeys(): MutableList<KyberPreKeyRecord> =
    loadIndex(indexKey).mapTo(mutableListOf()) { loadKyberPreKey(it) }

  override fun storeKyberPreKey(kyberPreKeyId: Int, record: KyberPreKeyRecord) {
    require(kyberPreKeyId >= 0) { "INVALID_KYBER_PREKEY_ID" }
    require(record.id == kyberPreKeyId) { "KYBER_PREKEY_ID_MISMATCH" }
    blobs.put(key(kyberPreKeyId), record.serialize())
    writeIndex(indexKey, loadIndex(indexKey) + kyberPreKeyId)
  }

  override fun containsKyberPreKey(kyberPreKeyId: Int): Boolean = blobs.contains(key(kyberPreKeyId))

  override fun markKyberPreKeyUsed(kyberPreKeyId: Int, signedPreKeyId: Int, baseKey: ECPublicKey) {
    if (!containsKyberPreKey(kyberPreKeyId)) {
      throw InvalidKeyIdException("Missing Kyber prekey $kyberPreKeyId")
    }

    if (!isLastResort(kyberPreKeyId)) {
      removeKyberPreKey(kyberPreKeyId)
      return
    }

    val replayKey = replayKey(kyberPreKeyId, signedPreKeyId, baseKey)
    if (blobs.contains(replayKey)) {
      throw ReusedBaseKeyException("Reused base key for Kyber last-resort prekey")
    }
    blobs.put(replayKey, byteArrayOf(1))
  }

  fun storeLastResortKyberPreKey(kyberPreKeyId: Int, record: KyberPreKeyRecord) {
    storeKyberPreKey(kyberPreKeyId, record)
    writeIndex(lastResortIndexKey, loadIndex(lastResortIndexKey) + kyberPreKeyId)
  }

  fun removeKyberPreKey(kyberPreKeyId: Int) {
    blobs.remove(key(kyberPreKeyId))
    writeIndex(indexKey, loadIndex(indexKey) - kyberPreKeyId)
    writeIndex(lastResortIndexKey, loadIndex(lastResortIndexKey) - kyberPreKeyId)
    blobs.removePrefix("kyber-replay:$kyberPreKeyId:")
  }

  private fun isLastResort(id: Int): Boolean = loadIndex(lastResortIndexKey).contains(id)
  private fun key(id: Int) = "kyber-prekey:$id"

  private fun replayKey(kyberId: Int, signedId: Int, baseKey: ECPublicKey): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(baseKey.serialize())
    val fingerprint = digest.joinToString("") { "%02x".format(it) }
    return "kyber-replay:$kyberId:$signedId:$fingerprint"
  }

  private fun loadIndex(name: String): Set<Int> = blobs.get(name)
    ?.toString(Charsets.UTF_8)
    ?.split(',')
    ?.mapNotNull { it.toIntOrNull() }
    ?.filter { it >= 0 }
    ?.toSet()
    ?: emptySet()

  private fun writeIndex(name: String, ids: Set<Int>) {
    if (ids.isEmpty()) blobs.remove(name)
    else blobs.put(name, ids.sorted().joinToString(",").toByteArray(Charsets.UTF_8))
  }
}
