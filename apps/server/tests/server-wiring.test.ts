import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');

describe('production Socket.IO wiring', () => {
  it('registers extracted V1 handlers in the real connection path', () => {
    const requiredRegistrations = [
      'registerMediaHandlers({',
      'registerAccountDeletionHandler({',
      'registerGroupBanListHandler({',
    ];

    for (const registration of requiredRegistrations) {
      expect(serverSource, `${registration} must stay wired in server.ts`).toContain(registration);
    }
  });

  it('keeps push triggers connected to the real K-Pulse and message send paths', () => {
    expect(serverSource).toContain('void sendKPulsePush(recipientId, userId)');
    expect(serverSource).toMatch(/socket\.on\(['"]message:send['"][\s\S]*?void sendConversationPush\(/);
  });

  it('keeps the critical realtime V1 event surface reachable from production server.ts', () => {
    const requiredEvents = [
      'conversation:direct',
      'conversation:join',
      'conversation:history',
      'conversations:list',
      'group:create',
      'group:member-add',
      'group:member-remove',
      'group:role-set',
      'group:mute',
      'group:ban',
      'group:unban',
      'group:leave',
      'message:send',
      'message:receipt',
      'contacts:list',
      'contacts:requests',
      'contacts:blocked',
      'contacts:search',
      'contact:request',
      'contact:accept',
      'contact:decline',
      'contact:cancel',
      'contact:remove',
      'contact:favorite',
      'contact:block',
      'contact:unblock',
      'presence:update',
      'kpulse:send',
      'nudge:send',
    ];

    for (const event of requiredEvents) {
      expect(serverSource, `${event} must stay registered in the production socket server`).toContain(`socket.on('${event}'`);
    }
  });
});
