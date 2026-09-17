// Same helpers as bot-interactions-core.mjs, targeted at the "Kah" account
// instead of the QA "kenams_app" account. Kept as a separate file on purpose:
// bot-interactions-core.mjs backs the existing tested/cron'd QA pipeline
// (bot-interactions.test.mjs + bot-interactions.yml) — do not touch it.
import { createHash } from 'node:crypto';

export const KAH_ID = '590fc62f-8383-45e7-89a1-805066632b75';
export function stableMessageId(...parts) {
  const h = createHash('sha256').update(parts.join(':')).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function testConversation(conversation, botIds) {
  return conversation.members?.some(m => m.userId === KAH_ID)
    && conversation.members.every(m => m.userId === KAH_ID || botIds.has(m.userId));
}
export function latestUnanswered(messages, botId, now = Date.now()) {
  const ordered = [...messages].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const newest = ordered.filter(m => m.senderUserId === KAH_ID && Date.parse(m.createdAt) >= now - 86400_000).at(-1);
  if (!newest) return null;
  const replyId = stableMessageId(botId, newest.id, 'reply');
  if (ordered.some(m => m.senderUserId === botId && (m.clientMessageId === replyId || Date.parse(m.createdAt) >= Date.parse(newest.createdAt)))) return null;
  return newest;
}
export function emitAck(socket, event, payload, timeoutMs = 12_000) {
  return new Promise((resolve,reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, result) => {
      if (error) return reject(new Error(`${event}: timeout`));
      if (!result?.ok) return reject(new Error(`${event}: ${result?.error ?? 'invalid acknowledgement'}`));
      resolve(result);
    });
  });
}
