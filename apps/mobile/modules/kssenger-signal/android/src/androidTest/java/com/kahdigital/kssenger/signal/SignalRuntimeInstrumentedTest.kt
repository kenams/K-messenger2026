package com.kahdigital.kssenger.signal

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.UUID
import org.junit.Assert.assertEquals
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
}
