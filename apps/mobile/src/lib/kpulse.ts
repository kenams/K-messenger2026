import { Platform, Vibration } from 'react-native';

/**
 * The K-Pulse signature sound — a two-note sonar ping that drops into a short
 * zap tail. Synthesised with the Web Audio API so it needs no bundled asset.
 * Native falls back to a haptic pattern (see {@link vibrateKPulse}).
 */
export function playKPulseSound(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const Ctx: typeof AudioContext =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.5, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    // Sonar ping: two quick sine blips a fifth apart.
    [
      { f: 1180, t: 0, d: 0.16 },
      { f: 1760, t: 0.075, d: 0.2 },
    ].forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.5, now + t + d);
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.6, now + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      osc.connect(g).connect(master);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    });

    // Zap tail: a fast sawtooth sweep through a low-pass.
    const zap = ctx.createOscillator();
    const zapGain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(820, now + 0.16);
    zap.frequency.exponentialRampToValueAtTime(120, now + 0.42);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, now + 0.16);
    lp.frequency.exponentialRampToValueAtTime(500, now + 0.42);
    zapGain.gain.setValueAtTime(0.0001, now + 0.16);
    zapGain.gain.exponentialRampToValueAtTime(0.4, now + 0.18);
    zapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    zap.connect(lp).connect(zapGain).connect(master);
    zap.start(now + 0.16);
    zap.stop(now + 0.55);

    window.setTimeout(() => { void ctx.close().catch(() => undefined); }, 1200);
  } catch {
    /* audio is a nice-to-have; never let it break the burst */
  }
}

/** Native haptic pattern for an incoming K-Pulse: two firm taps. */
export function vibrateKPulse(): void {
  if (Platform.OS === 'web') return;
  try {
    Vibration.vibrate(Platform.OS === 'android' ? [0, 45, 70, 110] : [0, 40, 60, 90]);
  } catch {
    /* ignore */
  }
}
