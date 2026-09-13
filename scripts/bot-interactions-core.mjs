import { createHash } from 'node:crypto';

export const KENAMS_ID = '85db1ffe-6c17-468f-8aca-aba9987aadef';
export function stableMessageId(...parts) {
  const h = createHash('sha256').update(parts.join(':')).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function testConversation(conversation, botIds) {
  return conversation.members?.some(m => m.userId === KENAMS_ID)
    && conversation.members.every(m => m.userId === KENAMS_ID || botIds.has(m.userId));
}
export function latestUnanswered(messages, botId, now = Date.now()) {
  const ordered = [...messages].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const newest = ordered.filter(m => m.senderUserId === KENAMS_ID && Date.parse(m.createdAt) >= now - 86400_000).at(-1);
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
