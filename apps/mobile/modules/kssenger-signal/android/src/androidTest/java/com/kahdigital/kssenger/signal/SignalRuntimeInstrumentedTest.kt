package com.kahdigital.kssenger.signal

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SignalRuntimeInstrumentedTest {
  @Test
  fun pqxdhAndDoubleRatchetRoundTripRunsOnAndroidRuntime() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val aliceDevice = UUID.randomUUID().toString()
    val bobDevice = UUID.randomUUID().toString()
    val aliceUser = "11111111-1111-4111-8111-111111111111"
    val bobUser = "22222222-2222-4222-8222-222222222222"
    val aliceDeviceNumber = 1
    val bobDeviceNumber = 2

    val alice = SignalDeviceProtocol(context, aliceDevice)
    val bob = SignalDeviceProtocol(context, bobDevice)
    val bobBundle = bob.provision(10)

    @Suppress("UNCHECKED_CAST")
    val ec = (bobBundle["oneTimePreKeys"] as List<Map<String, Any>>).first()
    @Suppress("UNCHECKED_CAST")
    val pq = (bobBundle["pqOneTimePreKeys"] as List<Map<String, Any>>).first()

    alice.processRemoteBundle(
      aliceUser,
      aliceDeviceNumber,
      bobUser,
      bobDeviceNumber,
      bobBundle["registrationId"] as Int,
      bobBundle["identityKey"] as String,
      bobBundle["signedPreKeyId"] as Int,
      bobBundle["signedPreKeyPublic"] as String,
      bobBundle["signedPreKeySignature"] as String,
      ec["keyId"] as Int,
      ec["publicKey"] as String,
      pq["keyId"] as Int,
      pq["publicKey"] as String,
      pq["signature"] as String,
    )

    val firstPlaintext = "K-ssenger Android runtime E2EE Alice -> Bob"
    val first = alice.encrypt(aliceUser, aliceDeviceNumber, bobUser, bobDeviceNumber, firstPlaintext)
    assertEquals("prekey", first["kind"])
    val bobClear = bob.decrypt(
      bobUser,
      bobDeviceNumber,
      aliceUser,
      aliceDeviceNumber,
      first["kind"] as String,
      first["ciphertext"] as String,
    )
    assertEquals(firstPlaintext, bobClear)

    val replyPlaintext = "K-ssenger Android runtime E2EE Bob -> Alice"
    val reply = bob.encrypt(bobUser, bobDeviceNumber, aliceUser, aliceDeviceNumber, replyPlaintext)
    assertEquals("signal", reply["kind"])
    val aliceClear = alice.decrypt(
      aliceUser,
      aliceDeviceNumber,
      bobUser,
      bobDeviceNumber,
      reply["kind"] as String,
      reply["ciphertext"] as String,
    )
    assertEquals(replyPlaintext, aliceClear)
    assertTrue(alice.hasSession(bobUser, bobDeviceNumber))
    assertTrue(bob.hasSession(aliceUser, aliceDeviceNumber))
  }

  @Test
  fun encryptedSessionsSurviveProtocolRecreationAndContinueRatchet() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val aliceDevice = UUID.randomUUID().toString()
    val bobDevice = UUID.randomUUID().toString()
    val aliceUser = "33333333-3333-4333-8333-333333333333"
    val bobUser = "44444444-4444-4444-8444-444444444444"
    val aliceDeviceNumber = 3
    val bobDeviceNumber = 4

    var alice = SignalDeviceProtocol(context, aliceDevice)
    var bob = SignalDeviceProtocol(context, bobDevice)
    val bobBundle = bob.provision(10)

    @Suppress("UNCHECKED_CAST")
    val ec = (bobBundle["oneTimePreKeys"] as List<Map<String, Any>>).first()
    @Suppress("UNCHECKED_CAST")
    val pq = (bobBundle["pqOneTimePreKeys"] as List<Map<String, Any>>).first()

    alice.processRemoteBundle(
      aliceUser,
      aliceDeviceNumber,
      bobUser,
      bobDeviceNumber,
      bobBundle["registrationId"] as Int,
      bobBundle["identityKey"] as String,
      bobBundle["signedPreKeyId"] as Int,
      bobBundle["signedPreKeyPublic"] as String,
      bobBundle["signedPreKeySignature"] as String,
      ec["keyId"] as Int,
      ec["publicKey"] as String,
      pq["keyId"] as Int,
      pq["publicKey"] as String,
      pq["signature"] as String,
    )

    val bootstrapPlaintext = "K-ssenger persisted session bootstrap"
    val bootstrap = alice.encrypt(aliceUser, aliceDeviceNumber, bobUser, bobDeviceNumber, bootstrapPlaintext)
    assertEquals("prekey", bootstrap["kind"])
    assertEquals(
      bootstrapPlaintext,
      bob.decrypt(
        bobUser,
        bobDeviceNumber,
        aliceUser,
        aliceDeviceNumber,
        bootstrap["kind"] as String,
        bootstrap["ciphertext"] as String,
      ),
    )

    val acknowledgementPlaintext = "K-ssenger persisted session acknowledgement"
    val acknowledgement = bob.encrypt(
      bobUser,
      bobDeviceNumber,
      aliceUser,
      aliceDeviceNumber,
      acknowledgementPlaintext,
    )
    assertEquals("signal", acknowledgement["kind"])
    assertEquals(
      acknowledgementPlaintext,
      alice.decrypt(
        aliceUser,
        aliceDeviceNumber,
        bobUser,
        bobDeviceNumber,
        acknowledgement["kind"] as String,
        acknowledgement["ciphertext"] as String,
      ),
    )

    alice = SignalDeviceProtocol(context, aliceDevice)
    bob = SignalDeviceProtocol(context, bobDevice)
    assertTrue(alice.hasSession(bobUser, bobDeviceNumber))
    assertTrue(bob.hasSession(aliceUser, aliceDeviceNumber))

    val afterRestartPlaintext = "K-ssenger persisted ratchet Alice -> Bob"
    val afterRestart = alice.encrypt(
      aliceUser,
      aliceDeviceNumber,
      bobUser,
      bobDeviceNumber,
      afterRestartPlaintext,
    )
    assertEquals("signal", afterRestart["kind"])
    assertEquals(
      afterRestartPlaintext,
      bob.decrypt(
        bobUser,
        bobDeviceNumber,
        aliceUser,
        aliceDeviceNumber,
        afterRestart["kind"] as String,
        afterRestart["ciphertext"] as String,
      ),
    )

    val replyPlaintext = "K-ssenger persisted ratchet Bob -> Alice"
    val reply = bob.encrypt(bobUser, bobDeviceNumber, aliceUser, aliceDeviceNumber, replyPlaintext)
    assertEquals("signal", reply["kind"])
    assertEquals(
      replyPlaintext,
      alice.decrypt(
        aliceUser,
        aliceDeviceNumber,
        bobUser,
        bobDeviceNumber,
        reply["kind"] as String,
        reply["ciphertext"] as String,
      ),
    )
  }

  @Test
  fun localSentMessageCachePersistsEncryptedAtRestAcrossStoreRecreation() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val userId = "55555555-5555-4555-8555-555555555555"
    val messageId = UUID.randomUUID().toString()
    val plaintext = "K-ssenger sender-visible history survives restart"

    var store = LocalMessageStore(KeystoreBlobStore(context, "local-message-instrumentation"))
    store.put(userId, messageId, plaintext)
    assertEquals(plaintext, store.get(userId, messageId))

    store = LocalMessageStore(KeystoreBlobStore(context, "local-message-instrumentation"))
    assertEquals(plaintext, store.get(userId, messageId))

    store.remove(userId, messageId)
    assertNull(store.get(userId, messageId))
  }
}
