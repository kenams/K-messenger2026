import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getBackend } from './backend';

/**
 * Plaintext chat transport.
 *
 * K-ssenger's end-to-end encryption (libsignal) is not shipped yet: it required
 * a native module that crashed the Android build and was never usable. Until a
 * vetted E2EE implementation lands, messages travel in clear over the TLS
 * Socket.IO connection and are stored server-side — the same trust model as a
 * classic messenger before an E2EE upgrade. The `messages.ciphertext` column
 * carries the message text verbatim under this algorithm tag.
 */
export const PLAINTEXT_ALGO = 'kssenger-plaintext-v1';
const LEGACY_SIGNAL_ALGOS = new Set([
  'signal-libsignal-multidevice-v1',
  'signal-libsignal',
]);

const INSTALL_KEY = 'kssenger.chat.install';

async function readInstallId(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(INSTALL_KEY) ?? null;
    return await SecureStore.getItemAsync(INSTALL_KEY.replace(/\./g, '_'));
  } catch {
    return null;
  }
}

async function writeInstallId(value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(INSTALL_KEY, value); return; }
    await SecureStore.setItemAsync(INSTALL_KEY.replace(/\./g, '_'), value);
  } catch {
    /* best effort — a fresh device row will just be created next time */
  }
}

function randomId(): string {
  const g = globalThis.crypto;
  if (g?.randomUUID) return g.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

let cachedDeviceId: string | null = null;

/**
 * Returns a stable `devices` row id for this install to use as `senderDeviceId`.
 * No cryptographic keys are attached — the row is only an addressable sender
 * identity that the server's `requireActiveDevice` check accepts.
 */
export async function ensureChatDevice(userId: string): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  let installId = await readInstallId();
  if (!installId) { installId = randomId(); await writeInstallId(installId); }

  const platformLabel = Platform.OS === 'web' ? 'Web' : Platform.OS === 'ios' ? 'iOS' : 'Android';
  const deviceName = `K-ssenger ${platformLabel} ${installId.slice(0, 8)}`;

  const existing = await getBackend().from('devices')
    .select('id').eq('user_id', userId).eq('name', deviceName).is('revoked_at', null).limit(1);
  if (!existing.error) {
    const id = ((existing.data ?? []) as Array<{ id?: string }>)[0]?.id;
    if (id) { cachedDeviceId = String(id); return cachedDeviceId; }
  }

  const inserted = await getBackend().from('devices')
    .insert({ user_id: userId, name: deviceName }).select('id').single();
  if (inserted.error || !inserted.data?.id) throw inserted.error ?? new Error('CHAT_DEVICE_CREATE_FAILED');
  cachedDeviceId = String(inserted.data.id);
  return cachedDeviceId;
}

export type WireMessage = { algorithm: string; ciphertext?: string | null };

/** The readable text of a message, or a placeholder for messages we can't show. */
export function readMessageText(message: WireMessage): string {
  if (message.algorithm === PLAINTEXT_ALGO) return message.ciphertext ?? '';
  if (LEGACY_SIGNAL_ALGOS.has(message.algorithm)) return '🔒 Message chiffré (version précédente, non lisible)';
  return message.ciphertext ?? '';
}

export function encodePlaintext(text: string): { algorithm: string; ciphertext: string } {
  return { algorithm: PLAINTEXT_ALGO, ciphertext: text };
}
