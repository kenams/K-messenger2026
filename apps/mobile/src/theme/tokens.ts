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

/**
 * Theme "skins" — alternate K-ssenger identities, orthogonal to the
 * light/dark mode axis. Each skin ships its own light + dark palette pair,
 * built from the classic MSN-KAH palette as a base so presence dots,
 * danger/success feedback and the KAH navy brand mark stay universal, while
 * ink, surfaces and accents change enough to read as a genuinely different
 * product mood — never just a hue-shifted copy of the same background.
 *
 * Never add a raw hex colour to a screen for a skin — extend the palette
 * here so every screen reading `colors.xxx` via `useTheme()` stays correct
 * across all five skins × two modes.
 */
export type ThemeSkin = 'classic' | 'pro' | 'douceur' | 'sport' | 'aurora';

function skinFrom(base: Palette, overrides: Partial<Palette>): Palette {
  return { ...base, ...overrides };
}

export const skinLabel: Record<ThemeSkin, string> = {
  classic: 'Classique',
  pro: 'Pro',
  douceur: 'Douceur',
  sport: 'Sport',
  aurora: 'Aurora',
};

/** One representative swatch colour per skin, for the picker UI (always the *light* accent). */
export const skinSwatch: Record<ThemeSkin, string> = {
  classic: '#A67C3D',
  pro: '#3B5978',
  douceur: '#C97B93',
  sport: '#FF5A36',
  aurora: '#7C5CFF',
};

const proLight = skinFrom(lightPalette, {
  azure: '#3B5978', azureDeep: '#2C4159', azurePress: '#233347', azureSoft: '#E7ECF1', azureHalo: 'rgba(59,89,120,0.14)',
  ink: '#1A1D22', inkSoft: '#4C535C', inkFaint: '#8A9099', inkOnAzure: '#F5F7FA',
  sky: '#F4F5F7', skyTop: '#EDEFF2', skyBottom: '#FAFBFC',
  surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#ECEEF1',
  hairline: '#E3E6EA', hairlineStrong: '#D2D7DD', hairlineSoft: '#EDEFF2',
  music: '#5C8A99', musicDeep: '#436672', musicSoft: '#E9F1F3',
  brass: '#B9975B', brassSoft: '#F3EDE0',
  wizz: '#B97A63', wizzSoft: '#F3E7E2',
});

const proDark = skinFrom(darkPalette, {
  azure: '#6D93B8', azureDeep: '#5A7EA0', azurePress: '#4A6A89', azureSoft: 'rgba(109,147,184,0.16)', azureHalo: 'rgba(109,147,184,0.22)',
  ink: '#EDEEF0', inkSoft: '#A9AEB5', inkFaint: '#767B82',
  sky: '#111316', skyTop: '#17191D', skyBottom: '#0A0B0D',
  surface: '#1B1D21', surfaceRaised: '#22252A', surfaceSunken: '#0D0E10',
  hairline: '#2A2D32', hairlineStrong: '#3A3E44', hairlineSoft: '#242629',
  music: '#7FA6B3', musicDeep: '#5C8492', musicSoft: 'rgba(127,166,179,0.16)',
  brass: '#C9AD78', brassSoft: 'rgba(201,173,120,0.16)',
  wizz: '#C99280', wizzSoft: 'rgba(201,146,128,0.16)',
});

const douceurLight = skinFrom(lightPalette, {
  azure: '#C97B93', azureDeep: '#A85B77', azurePress: '#8F4A64', azureSoft: '#FBE4EC', azureHalo: 'rgba(201,123,147,0.16)',
  ink: '#3B2733', inkSoft: '#6E5262', inkFaint: '#A4899A', inkOnAzure: '#FFF8FA',
  sky: '#FDEFEF', skyTop: '#FCE8EC', skyBottom: '#FFF6F5',
  surface: '#FFFFFF', surfaceRaised: '#FFFDFE', surfaceSunken: '#FBE9EE',
  hairline: '#F3D9E0', hairlineStrong: '#EBC3CF', hairlineSoft: '#FCEEF2',
  music: '#9C8FD9', musicDeep: '#7C6DC4', musicSoft: '#F0EDFB',
  brass: '#E3A8B9', brassSoft: '#FCEEF2',
  wizz: '#F2A488', wizzSoft: '#FDEEE7',
  favoriteSoft: '#FCEFD8', favoriteBorder: '#E8B9C9', favoriteText: '#A85B77',
});

const douceurDark = skinFrom(darkPalette, {
  azure: '#E39BB2', azureDeep: '#D383A0', azurePress: '#C06C8A', azureSoft: 'rgba(227,155,178,0.18)', azureHalo: 'rgba(227,155,178,0.24)',
  ink: '#F6E9EE', inkSoft: '#C9AFBC', inkFaint: '#8F7684',
  sky: '#241621', skyTop: '#2B1A28', skyBottom: '#180F17',
  surface: '#2E1C29', surfaceRaised: '#382332', surfaceSunken: '#150D13',
  hairline: '#3D2A35', hairlineStrong: '#4E3745', hairlineSoft: '#301F2B',
  music: '#B6A8E8', musicDeep: '#9384CE', musicSoft: 'rgba(182,168,232,0.16)',
  brass: '#E8BFCE', brassSoft: 'rgba(232,191,206,0.16)',
  wizz: '#F0B39B', wizzSoft: 'rgba(240,179,155,0.16)',
  favoriteSoft: 'rgba(232,191,206,0.18)', favoriteBorder: '#E8BFCE', favoriteText: '#F3D6E1',
});

const sportLight = skinFrom(lightPalette, {
  azure: '#FF5A36', azureDeep: '#D9431F', azurePress: '#B93816', azureSoft: '#FFE4DA', azureHalo: 'rgba(255,90,54,0.16)',
  ink: '#12181A', inkSoft: '#485257', inkFaint: '#84909A', inkOnAzure: '#FFFFFF',
  sky: '#F5F7F8', skyTop: '#EEF1F3', skyBottom: '#FBFCFD',
  surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#ECEFF1',
  hairline: '#E2E7E9', hairlineStrong: '#CFD7DA', hairlineSoft: '#EEF1F3',
  music: '#00A9B7', musicDeep: '#00838E', musicSoft: '#DEF6F8',
  brass: '#F0A400', brassSoft: '#FEF2D9',
  wizz: '#FF5A36', wizzSoft: '#FFE4DA',
});

const sportDark = skinFrom(darkPalette, {
  azure: '#FF6A3D', azureDeep: '#FF8557', azurePress: '#E85A2E', azureSoft: 'rgba(255,106,61,0.18)', azureHalo: 'rgba(255,106,61,0.26)',
  ink: '#F2F5F6', inkSoft: '#AEB8BC', inkFaint: '#727C80',
  sky: '#0B0E10', skyTop: '#111517', skyBottom: '#050607',
  surface: '#14181B', surfaceRaised: '#1B2023', surfaceSunken: '#08090A',
  hairline: '#242A2D', hairlineStrong: '#333B3F', hairlineSoft: '#1D2124',
  music: '#28E1E8', musicDeep: '#1CB8BF', musicSoft: 'rgba(40,225,232,0.16)',
  brass: '#FFC24D', brassSoft: 'rgba(255,194,77,0.16)',
  wizz: '#FF8557', wizzSoft: 'rgba(255,133,87,0.18)',
});

const auroraLight = skinFrom(lightPalette, {
  azure: '#7C5CFF', azureDeep: '#5F3FE0', azurePress: '#4C2FC4', azureSoft: '#EDE7FF', azureHalo: 'rgba(124,92,255,0.16)',
  ink: '#1D1B3A', inkSoft: '#4E4B75', inkFaint: '#8B87AD', inkOnAzure: '#FFFFFF',
  sky: '#F5F3FF', skyTop: '#EEEAFC', skyBottom: '#FBFAFF',
  surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#EFEAFC',
  hairline: '#E4DFF7', hairlineStrong: '#D3CBF2', hairlineSoft: '#F1EDFC',
  music: '#33D6C0', musicDeep: '#22AE9C', musicSoft: '#E1F9F5',
  brass: '#C9A0FF', brassSoft: '#F3E9FF',
  wizz: '#FF7CC8', wizzSoft: '#FFE7F4',
});

const auroraDark = skinFrom(darkPalette, {
  azure: '#9B82FF', azureDeep: '#8468F0', azurePress: '#6E51DE', azureSoft: 'rgba(155,130,255,0.18)', azureHalo: 'rgba(155,130,255,0.26)',
  ink: '#F1EEFF', inkSoft: '#BDB6E6', inkFaint: '#7B76A3',
  sky: '#0D0B1F', skyTop: '#141127', skyBottom: '#070613',
  surface: '#171433', surfaceRaised: '#1E1A40', surfaceSunken: '#08071A',
  hairline: '#2A2650', hairlineStrong: '#3A3468', hairlineSoft: '#1C1938',
  music: '#3FF0D6', musicDeep: '#28C9B1', musicSoft: 'rgba(63,240,214,0.16)',
  brass: '#D9B8FF', brassSoft: 'rgba(217,184,255,0.16)',
  wizz: '#FF8FD4', wizzSoft: 'rgba(255,143,212,0.18)',
});

export const skinPalettes: Record<ThemeSkin, { light: Palette; dark: Palette }> = {
  classic: { light: lightPalette, dark: darkPalette },
  pro: { light: proLight, dark: proDark },
  douceur: { light: douceurLight, dark: douceurDark },
  sport: { light: sportLight, dark: sportDark },
  aurora: { light: auroraLight, dark: auroraDark },
};
