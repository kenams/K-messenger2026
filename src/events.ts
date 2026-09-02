// Typed Socket.IO contract. Server is zero-knowledge on message content:
// every payload that could ever carry conversation content is validated
// to be ciphertext-shaped (base64 envelope), never a "text"/"plaintext" field.
import { z } from "zod";

const b64 = z.string().min(1).regex(/^[A-Za-z0-9+/=_-]+$/);

export const CiphertextEnvelope = z.object({
  ciphertext: b64,
  nonce: b64,
  senderDeviceId: z.string().min(1),
  protocolVersion: z.number().int().nonnegative(),
  associatedData: b64.optional(),
}).strict(); // .strict() = reject unknown keys, incl. any "text"/"plaintext"

export type CiphertextEnvelope = z.infer<typeof CiphertextEnvelope>;

export const MessageSend = z.object({
  conversationId: z.string().min(1),
  clientMessageId: z.string().min(1), // idempotency
  envelope: CiphertextEnvelope,
}).strict();
export type MessageSend = z.infer<typeof MessageSend>;

export const MessageNew = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  senderDeviceId: z.string(),
  envelope: CiphertextEnvelope,
  sentAt: z.number(),
}).strict();
export type MessageNew = z.infer<typeof MessageNew>;

export const MessageAck = z.object({
  messageId: z.string(),
  state: z.enum(["delivered", "read"]),
}).strict();
export type MessageAck = z.infer<typeof MessageAck>;

export const PresenceUpdate = z.object({
  status: z.enum(["online", "busy", "away", "invisible"]),
}).strict();
export type PresenceUpdate = z.infer<typeof PresenceUpdate>;

export const TypingEvent = z.object({ conversationId: z.string() }).strict();
export type TypingEvent = z.infer<typeof TypingEvent>;

export const NudgeSend = z.object({
  conversationId: z.string(),
  kind: z.enum(["classic", "love", "rage", "troll"]).default("classic"),
}).strict();
export type NudgeSend = z.infer<typeof NudgeSend>;

/** Client -> server events. */
export interface ClientToServerEvents {
  "presence:update": (payload: PresenceUpdate) => void;
  "conversation:join": (payload: { conversationId: string }) => void;
  "message:send": (payload: MessageSend, ack: (result: { ok: true; messageId: string } | { ok: false; error: string }) => void) => void;
  "message:ack": (payload: MessageAck) => void;
  "typing:start": (payload: TypingEvent) => void;
  "typing:stop": (payload: TypingEvent) => void;
  "nudge:send": (payload: NudgeSend, ack: (result: { ok: true } | { ok: false; error: string }) => void) => void;
}

/** Server -> client events. */
export interface ServerToClientEvents {
  "presence:online": (payload: { userId: string; status: string }) => void;
  "message:new": (payload: MessageNew) => void;
  "message:ack": (payload: MessageAck & { messageId: string }) => void;
  "typing:start": (payload: TypingEvent & { fromUserId: string }) => void;
  "typing:stop": (payload: TypingEvent & { fromUserId: string }) => void;
  "nudge:receive": (payload: { fromUserId: string; kind: string; conversationId: string }) => void;
  "error": (payload: { message: string }) => void;
}
