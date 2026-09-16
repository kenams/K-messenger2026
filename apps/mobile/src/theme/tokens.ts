/**
 * K-ssenger design tokens — "MSN-2026, édition KAH Digital".
 *
 * The nostalgic buddy-list warmth, rebuilt in KAH Digital's own house
 * palette: antique gold as the primary interactive colour (matching
 * kah-digital.ch's #d6b36a accent), a warm ivory-porcelain surface instead
 * of cool chalk-blue, KAH's teal as the secondary "now playing" signature,
 * and its terracotta as the K-Pulse energy accent. Every screen pulls
 * colour, spacing, radius, type, elevation and motion from here so the
 * product reads as one confident, luxury object — never a template.
 *
 * Light and dark are two instances of the exact same shape (`Palette`), so
 * every screen that reads `colors.xxx` via `useTheme()` gets full type
 * safety and never has to special-case a theme. Never add a raw hex colour
 * to a screen — extend `Palette` here instead, in both `lightPalette` and
 * `darkPalette`.
 */

export const lightPalette = {
  // Brand ink — deep antique gold, calm, high-contrast on ivory
  azure: '#A67C3D',
  azureDeep: '#7F5D28',
  azurePress: '#6B4D1F',
  azureSoft: '#F6EBD6',
  azureHalo: 'rgba(166,124,61,0.16)',

  ink: '#1C140B',
  inkSoft: '#4A4032',
  inkFaint: '#8C8172',
  inkOnAzure: '#FFF8EC',

  // Deep navy-black — the KAH Digital emblem's own signature card colour.
  // Used for header bars and the brand mark in both themes: it already
  // reads as "dark" against ivory, and stays exactly as dark against the
  // dark-mode background, so it never needs its own theme variant.
  navy: '#0F1420',
  navyDeep: '#090C14',
  navyGlow: 'rgba(214,179,106,0.20)',

  // Surfaces — warm ivory porcelain, not chalk-blue. Layered.
  sky: '#F8F4EC',
  skyTop: '#F3ECDD',
  skyBottom: '#FBF8F2',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F2EBDD',
  glass: 'rgba(255,253,248,0.72)',
  scrim: 'rgba(20,14,6,0.46)',
  hairline: '#EAE1CD',
  hairlineStrong: '#DDD0B3',

  // Presence
  online: '#2FBF63',
  onlineRing: '#BEEECD',
  busy: '#E5484D',
  away: '#F2A007',
  invisible: '#93A3AF',
  offline: '#B7C4CE',

  // Signature accents — kah-digital.ch's exact CSS vars: --accent-secondary
  // (teal) and --accent-tertiary (terracotta). Brand-official, identical in
  // both themes — not a per-theme tint.
  music: '#7FB8C7',
  musicDeep: '#4C8A9A',
  musicSoft: '#EAF4F6',
  brass: '#D6B36A',
  brassSoft: '#FBF1DE',
  wizz: '#D28A68',
  wizzSoft: '#FBEDE6',

  // Feedback
  danger: '#C6362C',
  dangerSoft: '#FCEBE9',
  dangerBorder: '#EFB4B4',
  success: '#1C7F49',
  successSoft: '#E3F5EA',
  white: '#FFFFFF',

  // "Favorite" star — same antique-gold family as `brass`, its own tone so a
  // starred contact reads clearly against both `surface` and `dangerSoft`.
  favoriteSoft: '#FFF7D6',
  favoriteBorder: '#E7CA5C',
  favoriteText: '#B48A00',

  // Back-compat aliases (older screens) — resolve to the new scale.
  hairlineSoft: '#F0E8D6',
  pulse: '#D28A68',
  pulseSoft: '#FBEDE6',
} as const;

/** Same shape as `lightPalette`, but widened to plain strings so `darkPalette` can hold different literal hex/rgba values per key. */
export type Palette = { [K in keyof typeof lightPalette]: string };

/**
 * Dark mode — the ACTUAL kah-digital.ch dark theme, root CSS vars taken
 * directly from the live site: --background #0a0908, --foreground #f5f1e8,
 * --accent #d6b36a, --muted #b7b1a5. This is the reference KAH Digital
 * identity, not an invented variant — the ivory "light" theme is the app's
 * own stylistic choice, but dark mode must match the brand exactly. Every
 * key mirrors `lightPalette` exactly (enforced by `Palette`).
 */
export const darkPalette: Palette = {
  azure: '#D6B36A',
  azureDeep: '#C9A24E',
  azurePress: '#B3894A',
  azureSoft: 'rgba(214,179,106,0.16)',
  azureHalo: 'rgba(214,179,106,0.24)',

  ink: '#F5F1E8',
  inkSoft: '#B7B1A5',
  inkFaint: '#8A8478',
  inkOnAzure: '#FFF8EC',

  navy: '#0F1420',
  navyDeep: '#090C14',
  navyGlow: 'rgba(214,179,106,0.20)',

  // kah-digital.ch --background is #0a0908 — a warm near-black, not navy.
  sky: '#0A0908',
  skyTop: '#121110',
  skyBottom: '#060505',
  surface: '#141210',
  surfaceRaised: '#1C1916',
  surfaceSunken: '#050403',
  glass: 'rgba(20,18,16,0.78)',
  scrim: 'rgba(0,0,0,0.6)',
  hairline: '#2A251E',
  hairlineStrong: '#3B342A',

  online: '#3FD379',
  onlineRing: '#1F4A34',
  busy: '#F0645C',
  away: '#F5B238',
  invisible: '#9AA6B3',
  offline: '#5C6672',

  // Brand-official accents (see lightPalette) hold plenty of contrast
  // against #0A0908 as-is — no per-theme tint needed.
  music: '#7FB8C7',
  musicDeep: '#5A94A6',
  musicSoft: 'rgba(127,184,199,0.16)',
  brass: '#D6B36A',
  brassSoft: 'rgba(214,179,106,0.16)',
  wizz: '#D28A68',
  wizzSoft: 'rgba(210,138,104,0.16)',

  danger: '#F0645C',
  dangerSoft: 'rgba(198,54,44,0.22)',
  dangerBorder: 'rgba(240,100,92,0.45)',
  success: '#3FCB78',
  successSoft: 'rgba(28,127,73,0.22)',
  white: '#FFFFFF',

  favoriteSoft: 'rgba(214,179,106,0.18)',
  favoriteBorder: '#D6B36A',
  favoriteText: '#E7CD98',

  hairlineSoft: '#231F19',
  pulse: '#D28A68',
  pulseSoft: 'rgba(210,138,104,0.16)',
};

/** Reserved brand gradient — logo mark and the primary CTA only. Never decoration. */
export const brandGradient = ['#C9A24E', '#A67C3D', '#7F5D28'] as const;

/**
 * K-Feed / Moments' cinematic full-bleed video surface — always this dark,
 * in both light and dark app theme, like a video player letterbox. Centralized
 * here instead of ad-hoc hex literals scattered across those two screens.
 */
export const immersive = {
  surface: '#07131C',
  panel: '#102C3D',
  border: 'rgba(255,255,255,0.08)',
  noticeBg: '#153A4F',
  noticeText: '#D7EFFC',
  mutedText: '#7FA0B1',
  hintText: '#A8C4D4',
  ratingText: '#D5E4EC',
  warningText: '#E3EDF3',
  emptyText: '#9DB4C2',
  videoBlack: '#000000',
  scrimStrong: 'rgba(0,0,0,0.78)',
  scrim: 'rgba(0,0,0,0.48)',
} as const;

/** Full-screen takeover effects (K-Pulse "wizz") — deliberately theme-invariant, like a camera flash. */
export const overlayEffects = {
  backdrop: '#06121F',
  flash: '#EAF2FF',
} as const;

/** Third-party brand colours — never KAH's own palette, kept out of Palette on purpose. */
export const thirdPartyBrand = {
  spotifyGreen: '#1DB954',
} as const;

export const presenceColor: Record<string, string> = {
  online: lightPalette.online,
  busy: lightPalette.busy,
  away: lightPalette.away,
  invisible: lightPalette.invisible,
  offline: lightPalette.offline,
};

/** Presence dot colours resolved against the active theme (contrast-correct in dark mode). */
export function presenceColorFor(colors: Palette): Record<string, string> {
  return {
    online: colors.online,
    busy: colors.busy,
    away: colors.away,
    invisible: colors.invisible,
    offline: colors.offline,
  };
}

export const presenceLabel: Record<string, string> = {
  online: 'En ligne',
  busy: 'Occupé',
  away: 'Absent',
  invisible: 'Invisible',
  offline: 'Hors ligne',
};

export const presenceDot: Record<string, string> = {
  online: '🟢',
  busy: '🔴',
  away: '🟠',
  invisible: '👻',
  offline: '⚫',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 34,
  pill: 999,
} as const;

export type TypeTokens = ReturnType<typeof buildType>;

/** Typography tokens, built from the active theme's colours. */
export function buildType(colors: Palette) {
  return {
    brand: { fontSize: 10.5, letterSpacing: 3, fontWeight: '900' as const, color: colors.azureDeep },
    label: { fontSize: 10.5, letterSpacing: 1.4, fontWeight: '800' as const, color: colors.inkFaint },
    display: { fontSize: 30, fontWeight: '900' as const, color: colors.ink, letterSpacing: -0.5, lineHeight: 34 },
    title: { fontSize: 22, fontWeight: '900' as const, color: colors.ink, letterSpacing: -0.3 },
    heading: { fontSize: 17, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.2 },
    name: { fontSize: 15, fontWeight: '800' as const, color: colors.ink },
    body: { fontSize: 14.5, fontWeight: '500' as const, color: colors.ink, lineHeight: 21 },
    meta: { fontSize: 12, fontWeight: '600' as const, color: colors.inkSoft },
    micro: { fontSize: 10.5, fontWeight: '700' as const, color: colors.inkFaint, letterSpacing: 0.2 },
  } as const;
}

/** Static light-mode typography — only for the rare non-reactive spot (e.g. splash before ThemeProvider mounts). */
export const type = buildType(lightPalette);

export const elevation = {
  hairline: {
    shadowColor: '#0C2233',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  card: {
    shadowColor: '#0E3B5C',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#0A2A44',
    shadowOpacity: 0.14,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
} as const;

export const motion = {
  fast: 150,
  base: 230,
  slow: 400,
} as const;

/** Shared maximum content width so web never sprawls edge to edge. */
export const layout = {
  maxContent: 480,
  maxReading: 560,
} as const;

/** Back-compat static export — the light palette. Screens should prefer `useTheme().colors`. */
export const palette = lightPalette;
