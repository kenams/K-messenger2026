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
 */

export const palette = {
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

  // Signature accents — KAH Digital's exact gold, teal and terracotta
  music: '#5B95A8',
  musicSoft: '#E7F2F4',
  brass: '#D6B36A',
  brassSoft: '#FBF1DE',
  wizz: '#C97A57',
  wizzSoft: '#F7E9E1',

  // Feedback
  danger: '#C6362C',
  dangerSoft: '#FCEBE9',
  success: '#1C7F49',
  successSoft: '#E3F5EA',
  white: '#FFFFFF',

  // Back-compat aliases (older screens) — resolve to the new scale.
  hairlineSoft: '#F0E8D6',
  pulse: '#C97A57',
  pulseSoft: '#F7E9E1',
} as const;

/** Reserved brand gradient — logo mark and the primary CTA only. Never decoration. */
export const brandGradient = ['#C9A24E', '#A67C3D', '#7F5D28'] as const;

export const presenceColor: Record<string, string> = {
  online: palette.online,
  busy: palette.busy,
  away: palette.away,
  invisible: palette.invisible,
  offline: palette.offline,
};

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

export const type = {
  brand: { fontSize: 10.5, letterSpacing: 3, fontWeight: '900' as const, color: palette.azureDeep },
  label: { fontSize: 10.5, letterSpacing: 1.4, fontWeight: '800' as const, color: palette.inkFaint },
  display: { fontSize: 30, fontWeight: '900' as const, color: palette.ink, letterSpacing: -0.5, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: '900' as const, color: palette.ink, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '800' as const, color: palette.ink, letterSpacing: -0.2 },
  name: { fontSize: 15, fontWeight: '800' as const, color: palette.ink },
  body: { fontSize: 14.5, fontWeight: '500' as const, color: palette.ink, lineHeight: 21 },
  meta: { fontSize: 12, fontWeight: '600' as const, color: palette.inkSoft },
  micro: { fontSize: 10.5, fontWeight: '700' as const, color: palette.inkFaint, letterSpacing: 0.2 },
} as const;

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
