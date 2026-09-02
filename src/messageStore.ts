// Persists ciphertext-only message envelopes. Supabase-backed when
// configured, falls back to an in-memory Map for local dev (data lost on
// restart — fine for dev, never used in production without Supabase).
import { createClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "./env.js";
import type { CiphertextEnvelope } from "./events.js";

export type StoredMessage = {
  messageId: string;
  conversationId: string;
  senderDeviceId: string;
  envelope: CiphertextEnvelope;
  sentAt: number;
  state: "sent" | "delivered" | "read";
};

const memoryStore = new Map<string, StoredMessage>();
const memoryByConversation = new Map<string, string[]>();

const supabase = supabaseConfigured
  ? createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)
  : null;

export async function saveMessage(msg: StoredMessage): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("messages").insert({
      id: msg.messageId,
      conversation_id: msg.conversationId,
      sender_device_id: msg.senderDeviceId,
      ciphertext: msg.envelope.ciphertext,
      nonce: msg.envelope.nonce,
      protocol_version: msg.envelope.protocolVersion,
      associated_data: msg.envelope.associatedData ?? null,
      sent_at: new Date(msg.sentAt).toISOString(),
      state: msg.state,
    });
    if (error) throw new Error(`saveMessage: ${error.message}`);
    return;
  }
  memoryStore.set(msg.messageId, msg);
  const list = memoryByConversation.get(msg.conversationId) ?? [];
  list.push(msg.messageId);
  memoryByConversation.set(msg.conversationId, list);
}

export async function setMessageState(messageId: string, state: "delivered" | "read"): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("messages").update({ state }).eq("id", messageId);
    if (error) throw new Error(`setMessageState: ${error.message}`);
    return;
  }
  const existing = memoryStore.get(messageId);
  if (existing) memoryStore.set(messageId, { ...existing, state });
}

/** For offline delivery: undelivered messages for a conversation. */
export async function getUndeliveredForConversation(conversationId: string): Promise<StoredMessage[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .neq("state", "read")
      .order("sent_at", { ascending: true });
    if (error) throw new Error(`getUndeliveredForConversation: ${error.message}`);
    return (data ?? []).map((row) => ({
      messageId: row.id,
      conversationId: row.conversation_id,
      senderDeviceId: row.sender_device_id,
      envelope: {
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        protocolVersion: row.protocol_version,
        associatedData: row.associated_data ?? undefined,
        senderDeviceId: row.sender_device_id,
      },
      sentAt: new Date(row.sent_at).getTime(),
      state: row.state,
    }));
  }
  const ids = memoryByConversation.get(conversationId) ?? [];
  return ids.map((id) => memoryStore.get(id)!).filter((m) => m.state !== "read");
}
