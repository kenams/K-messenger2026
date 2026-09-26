import { Platform } from 'react-native';
import { getContactTone, type VibrationPatternKey } from './kTone';

/**
 * K-ssenger's sound + haptic identity: short original tones (not derived from
 * any other product) played on send/receive/social events, plus light haptic
 * feedback on native. No-ops safely on web and when a user disables sounds.
 */

let enabled = true;
export function setSoundsEnabled(next: boolean) {
  enabled = next;
}
export function soundsEnabled() {
  return enabled;
}

type SoundKey = 'send' | 'receive' | 'ping';

const SOURCES: Record<SoundKey, number> = {
  send: require('../../assets/sounds/send.wav'),
  receive: require('../../assets/sounds/receive.wav'),
  ping: require('../../assets/sounds/ping.wav'),
};

// Lazily import expo-audio only on native: it touches native modules that
// don't exist on web, and static import would break the web bundle.
let audioModulePromise: Promise<typeof import('expo-audio')> | null = null;
function loadAudioModule() {
  if (Platform.OS === 'web') return null;
  if (!audioModulePromise) audioModulePromise = import('expo-audio');
  return audioModulePromise;
}

const players = new Map<SoundKey, import('expo-audio').AudioPlayer>();

async function getPlayer(key: SoundKey) {
  const mod = await loadAudioModule();
  if (!mod) return null;
  let player = players.get(key);
  if (!player) {
    player = mod.createAudioPlayer(SOURCES[key]);
    players.set(key, player);
  }
  return player;
}

export async function playSound(key: SoundKey) {
  if (!enabled) return;
  try {
    const player = await getPlayer(key);
    if (!player) return;
    await player.seekTo(0);
    player.play();
  } catch {
    // Sound is cosmetic — never break the app over a playback failure.
  }
}

let hapticsModulePromise: Promise<typeof import('expo-haptics')> | null = null;
function loadHaptics() {
  if (Platform.OS === 'web') return null;
  if (!hapticsModulePromise) hapticsModulePromise = import('expo-haptics');
  return hapticsModulePromise;
}

export async function hapticLight() {
  if (!enabled) return;
  try {
    const mod = await loadHaptics();
    if (!mod) return;
    await mod.impactAsync(mod.ImpactFeedbackStyle.Light);
  } catch {
    // best-effort
  }
}

export async function hapticSuccess() {
  if (!enabled) return;
  try {
    const mod = await loadHaptics();
    if (!mod) return;
    await mod.notificationAsync(mod.NotificationFeedbackType.Success);
  } catch {
    // best-effort
  }
}

/** Message I just sent: quick tick + light tap. */
export function onMessageSent() {
  void playSound('send');
  void hapticLight();
}

/** Message received from someone else while the chat is open. */
export function onMessageReceived() {
  void playSound('receive');
  void hapticLight();
}

async function playVibrationPattern(pattern: VibrationPatternKey) {
  if (!enabled || pattern === 'none') return;
  try {
    const mod = await loadHaptics();
    if (!mod) return;
    const impact = () => mod.impactAsync(mod.ImpactFeedbackStyle.Medium);
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    if (pattern === 'simple') {
      await impact();
    } else if (pattern === 'double') {
      await impact();
      await wait(150);
      await impact();
    } else if (pattern === 'longue') {
      await mod.notificationAsync(mod.NotificationFeedbackType.Warning);
    }
  } catch {
    // best-effort
  }
}

/**
 * Message/K-Pulse received from a specific contact: looks up that contact's
 * K-Tone override (per-device preference) and plays it instead of the
 * default 'receive' sound+light haptic. Falls back to the default behavior
 * when no override is set for this contact.
 */
export function onMessageReceivedFrom(myUserId: string, contactId: string) {
  void (async () => {
    const tone = await getContactTone(myUserId, contactId);
    if (!tone.soundKey && !tone.vibrationPattern) {
      onMessageReceived();
      return;
    }
    void playSound(tone.soundKey ?? 'receive');
    if (tone.vibrationPattern) void playVibrationPattern(tone.vibrationPattern);
    else void hapticLight();
  })();
}

/** Added to a group, got a contact request, or another social nudge. */
export function onSocialPing() {
  void playSound('ping');
  void hapticSuccess();
}
