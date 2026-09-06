export type UUID = string;

export type EncryptedMessageEnvelope = {
  clientMessageId: UUID;
  conversationId: UUID;
  senderDeviceId: UUID;
  algorithm: string;
  ciphertext: string;
  nonce?: string;
  aad?: string;
  createdAt: string;
};

export type PresenceStatus = 'online' | 'busy' | 'away' | 'invisible' | 'offline';

export type LocationPrecision = 'precise' | 'approximate';

export type LocationShareScope =
  | { kind: 'contact'; contactId: UUID }
  | { kind: 'conversation'; conversationId: UUID }
  | { kind: 'favorites' };

export type LiveLocationPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
};
