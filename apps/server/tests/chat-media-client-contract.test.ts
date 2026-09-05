import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const directChatSource = readFileSync(
  resolve(process.cwd(), '../mobile/src/features/chats/DirectConversationScreen.tsx'),
  'utf8',
);

const mediaClientSource = readFileSync(
  resolve(process.cwd(), '../mobile/src/lib/media.ts'),
  'utf8',
);

describe('private chat media client contract', () => {
  it('keeps chat media authorization-aware instead of rendering a stored public URL', () => {
    expect(directChatSource).toContain('getMediaDownload(content.mediaId)');
    expect(directChatSource).not.toMatch(/content\.publicUrl|content\.url|media\.publicUrl/);
    expect(mediaClientSource).toMatch(/getMediaDownload|media.*download/i);
  });

  it('binds private uploads to the active conversation', () => {
    expect(directChatSource).toContain("purpose: 'chat', conversationId");
    expect(directChatSource).toContain("type: 'media'; mediaId: string; mimeType: SupportedMediaMime");
  });

  it('sends only the media reference through the Signal message contract', () => {
    expect(directChatSource).toContain('serializeChatContent(content)');
    expect(directChatSource).toContain('encryptDirectForContact(currentUserId, contact.id, plaintext)');
    expect(directChatSource).toContain('mediaId, mimeType');
    expect(directChatSource).not.toMatch(/uploadLocalMedia\([\s\S]*?ciphertext\s*:/);
  });

  it('keeps the UI claim scoped to encrypted text and media references', () => {
    expect(directChatSource).toContain('texte et références média chiffrés de bout en bout');
  });
});
