/**
 * K-Tone: per-contact custom notification sound + vibration pattern.
 *
 * Purely a client-side, per-device preference (not synced, not sent to the
 * server) — cosmetic and non-sensitive, so it follows the same storage idiom
 * as `e2ee.ts`/`musicNowPlaying.ts`: localStorage on web, SecureStore on
 * native, keyed per `${myUserId}:${contactId}`. No new dependency: the repo
 * has no AsyncStorage, so this reuses expo-secure-store like everything else
 * that persists small per-device values.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ToneSoundKey = 'send' | 'receive' | 'ping';
export type VibrationPatternKey = 'simple' | 'double' | 'longue' | 'none';

export type ContactTonePreference = {
  soundKey: ToneSoundKey | null;
  vibrationPattern: VibrationPatternKey | null;
};

export const TONE_SOUND_OPTIONS: { key: ToneSoundKey; label: string }[] = [
  { key: 'receive', label: 'Défaut (Reçu)' },
  { key: 'ping', label: 'Ping' },
  { key: 'send', label: 'Envoi' },
];

export const VIBRATION_PATTERN_OPTIONS: { key: VibrationPatternKey; label: string }[] = [
  { key: 'simple', label: 'Simple' },
  { key: 'double', label: 'Double' },
  { key: 'longue', label: 'Longue' },
  { key: 'none', label: 'Aucune' },
];

const NONE: ContactTonePreference = { soundKey: null, vibrationPattern: null };

function storageKey(myUserId: string, contactId: string): string {
  return `kssenger.ktone.${myUserId}.${contactId}`;
}

async function readKey(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key.replace(/[.:]/g, '_'));
  } catch {
    return null;
  }
}

async function writeKey(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    const nativeKey = key.replace(/[.:]/g, '_');
    if (value === null) await SecureStore.deleteItemAsync(nativeKey);
    else await SecureStore.setItemAsync(nativeKey, value);
  } catch {
    /* best effort — K-Tone is cosmetic, never blocks the app */
  }
}

export async function getContactTone(myUserId: string, contactId: string): Promise<ContactTonePreference> {
  if (!myUserId || !contactId) return NONE;
  const raw = await readKey(storageKey(myUserId, contactId));
  if (!raw) return NONE;
  try {
    const parsed = JSON.parse(raw) as Partial<ContactTonePreference>;
    return {
      soundKey: (['send', 'receive', 'ping'] as string[]).includes(parsed.soundKey ?? '') ? (parsed.soundKey as ToneSoundKey) : null,
      vibrationPattern: (['simple', 'double', 'longue', 'none'] as string[]).includes(parsed.vibrationPattern ?? '')
        ? (parsed.vibrationPattern as VibrationPatternKey)
        : null,
    };
  } catch {
    return NONE;
  }
}

export async function setContactTone(myUserId: string, contactId: string, prefs: ContactTonePreference): Promise<void> {
  if (!myUserId || !contactId) return;
  await writeKey(storageKey(myUserId, contactId), JSON.stringify(prefs));
}

export async function clearContactTone(myUserId: string, contactId: string): Promise<void> {
  if (!myUserId || !contactId) return;
  await writeKey(storageKey(myUserId, contactId), null);
}
