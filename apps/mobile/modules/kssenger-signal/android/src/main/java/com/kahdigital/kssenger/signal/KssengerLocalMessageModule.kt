package com.kahdigital.kssenger.signal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KssengerLocalMessageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KssengerLocalMessageBridge")

    AsyncFunction("store") { userId: String, messageId: String, plaintext: String ->
      require(plaintext.toByteArray(Charsets.UTF_8).size <= 256 * 1024) { "LOCAL_MESSAGE_TOO_LARGE" }
      store().put(userId, messageId, plaintext)
      true
    }

    AsyncFunction("load") { userId: String, messageId: String ->
      store().get(userId, messageId)
    }

    AsyncFunction("remove") { userId: String, messageId: String ->
      store().remove(userId, messageId)
      true
    }
  }

  private fun store(): LocalMessageStore {
    val context = appContext.reactContext ?: throw IllegalStateException("ANDROID_CONTEXT_UNAVAILABLE")
    return LocalMessageStore(KeystoreBlobStore(context, "local-messages-v1"))
  }
}
