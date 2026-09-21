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

  it('sends only the media reference (never bytes) through the message contract', () => {
    expect(directChatSource).toContain('serializeChatContent(content)');
    expect(directChatSource).toContain('encodePlaintext(payload)');
    expect(directChatSource).toContain('mediaId, mimeType');
    // the raw upload bytes must never be inlined into the wire message
    expect(directChatSource).not.toMatch(/uploadLocalMedia\([\s\S]*?ciphertext\s*:/);
  });

  it('makes an honest, conditional transport claim in the UI — never claims E2EE unless a shared key was actually established', () => {
    // Real E2EE ships for direct chats (NaCl box, see lib/e2ee.ts), but only
    // once both sides have exchanged public keys. The banner must reflect
    // e2eeActive rather than asserting encryption unconditionally.
    expect(directChatSource).toContain('e2eeActive ?');
    expect(directChatSource).toContain('Chiffré de bout en bout');
    expect(directChatSource).toContain('Connexion sécurisée (TLS)');
    // The claim must be gated on the real key-derivation outcome, not a constant.
    expect(directChatSource).toContain('keysRef.current');
    expect(directChatSource).toMatch(/setE2eeActive\(true\)/);
  });

  it('never sends a direct message claiming encryption without actually encrypting it', () => {
    expect(directChatSource).toContain('encryptDirectMessage(payload, keys.mySecretKey, keys.peerPublicKey)');
    expect(directChatSource).toContain(': encodePlaintext(payload)');
  });

  it('fails closed on unsafe or expired presigned media requests before fetch', () => {
    expect(mediaClientSource).toContain("assertSignedMediaRequest(prepared.upload, 'PUT')");
    expect(mediaClientSource).toContain("assertSignedMediaRequest(prepared.download, 'GET')");
    expect(mediaClientSource).toContain("parsed.protocol !== 'https:'");
    expect(mediaClientSource).toContain('parsed.username || parsed.password');
    expect(mediaClientSource).toContain('request.method.toUpperCase() !== expectedMethod');
    expect(mediaClientSource).toContain('expiresAt <= Date.now() + MIN_SIGNED_URL_LIFETIME_MS');

    const uploadGuard = mediaClientSource.indexOf("assertSignedMediaRequest(prepared.upload, 'PUT')");
    const uploadFetch = mediaClientSource.indexOf('fetch(prepared.upload.url');
    const downloadGuard = mediaClientSource.indexOf("assertSignedMediaRequest(prepared.download, 'GET')");
    expect(uploadGuard).toBeGreaterThan(-1);
    expect(uploadFetch).toBeGreaterThan(uploadGuard);
    expect(downloadGuard).toBeGreaterThan(-1);
  });
});
