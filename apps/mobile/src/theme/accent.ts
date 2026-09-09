import { palette } from './tokens';

/**
 * A member's accent colour — the one personalisation that follows their
 * identity everywhere it shows (their profile, their name in your list,
 * the header when you chat with them). Stored on `profiles.accent_color`.
 */
export const ACCENT_PRESETS = [
  '#1C6FD6', // K-ssenger azure (default)
  '#7A5BFF', // violet
  '#12B981', // emerald
  '#F0435B', // rose
  '#F59E0B', // amber
  '#0EA5A5', // teal
  '#EC4899', // pink
  '#111827', // ink
] as const;

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Falls back to the brand azure for any missing / malformed value. */
export function accentOf(color: string | null | undefined): string {
  return color && HEX.test(color) ? color : palette.azure;
}

export function isValidAccent(color: string): boolean {
  return HEX.test(color);
}

/** Readable text colour to sit on top of an accent fill. */
export function onAccent(color: string): string {
  const hex = accentOf(color).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? palette.ink : palette.white;
}

/** A very light tint of the accent, for soft backgrounds. */
export function accentSoft(color: string): string {
  return `${accentOf(color)}1F`; // ~12% alpha
}
