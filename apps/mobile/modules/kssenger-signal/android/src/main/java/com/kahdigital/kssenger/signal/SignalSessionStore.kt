package com.kahdigital.kssenger.signal

import android.util.Base64
import java.security.MessageDigest
import org.signal.libsignal.protocol.NoSessionException
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SessionStore

/** Durable official-libsignal SessionStore backed by K-ssenger's native-only encrypted store. */
internal class SignalSessionStore(
  private val blobs: KeystoreBlobStore,
) : SessionStore {
  override fun loadSession(address: SignalProtocolAddress): SessionRecord {
    val serialized = blobs.get(sessionKey(address)) ?: return SessionRecord()
    return SessionRecord(serialized)
  }

  override fun loadExistingSessions(addresses: MutableList<SignalProtocolAddress>): MutableList<SessionRecord> {
    return addresses.mapTo(mutableListOf()) { address ->
      val serialized = blobs.get(sessionKey(address)) ?: throw NoSessionException("No session for $address")
      SessionRecord(serialized)
    }
  }

  override fun getSubDeviceSessions(name: String): MutableList<Int> = readDeviceIndex(name).toMutableList()

  override fun storeSession(address: SignalProtocolAddress, record: SessionRecord) {
    blobs.put(sessionKey(address), record.serialize())
    val devices = readDeviceIndex(address.name).toMutableSet()
    if (devices.add(address.deviceId)) writeDeviceIndex(address.name, devices)
  }

  override fun containsSession(address: SignalProtocolAddress): Boolean = blobs.contains(sessionKey(address))

  override fun deleteSession(address: SignalProtocolAddress) {
    blobs.remove(sessionKey(address))
    val devices = readDeviceIndex(address.name).toMutableSet()
    if (devices.remove(address.deviceId)) writeDeviceIndex(address.name, devices)
  }

  override fun deleteAllSessions(name: String) {
    for (deviceId in readDeviceIndex(name)) {
      blobs.remove(sessionKey(SignalProtocolAddress(name, deviceId)))
    }
    blobs.remove(indexKey(name))
  }

  private fun readDeviceIndex(name: String): Set<Int> {
    val stored = blobs.get(indexKey(name)) ?: return emptySet()
    val text = stored.toString(Charsets.UTF_8)
    if (text.isBlank()) return emptySet()
    return text.split(',').mapNotNull { it.toIntOrNull() }.filter { it in 1..127 }.toSet()
  }

  private fun writeDeviceIndex(name: String, devices: Set<Int>) {
    if (devices.isEmpty()) {
      blobs.remove(indexKey(name))
      return
    }
    val encoded = devices.sorted().joinToString(",").toByteArray(Charsets.UTF_8)
    blobs.put(indexKey(name), encoded)
  }

  private fun sessionKey(address: SignalProtocolAddress) = "session:${nameDigest(address.name)}:${address.deviceId}"
  private fun indexKey(name: String) = "session-index:${nameDigest(name)}"

  private fun nameDigest(name: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(name.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  }
}
