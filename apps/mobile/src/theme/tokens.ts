/**
 * K-ssenger design tokens — "MSN-2026, édition Lumière".
 *
 * The nostalgic buddy-list warmth, rebuilt at studio craft level: a deep
 * midnight-azure ink over an airy porcelain sky, one vivid presence green, a
 * reserved violet for the live "now playing" signature, and a single warm brass
 * accent kept only for moments of delight (a wizz landing, a celebratory state).
 * Every screen pulls colour, spacing, radius, type, elevation and motion from
 * here so the product reads as one confident object.
 */

export const palette = {
  // Brand ink — deep, calm, high-contrast on porcelain
  azure: '#1C6FD6',
  azureDeep: '#0E4EA6',
  azurePress: '#0B3F86',
  azureSoft: '#E8F1FF',
  azureHalo: 'rgba(28,111,214,0.14)',

  ink: '#0C2233',
  inkSoft: '#42596B',
  inkFaint: '#8096A4',
  inkOnAzure: '#F4F8FF',

  // Surfaces — porcelain, not chalk. Layered.
  sky: '#F1F5FA',
  skyTop: '#E9F1FA',
  skyBottom: '#F7FAFD',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EEF3F9',
  glass: 'rgba(255,255,255,0.72)',
  scrim: 'rgba(9,24,37,0.46)',
  hairline: '#E2EAF2',
  hairlineStrong: '#D2DEEA',

  // Presence
  online: '#2FBF63',
  onlineRing: '#BEEECD',
  busy: '#E5484D',
  away: '#F2A007',
  invisible: '#93A3AF',
  offline: '#B7C4CE',

  // Signature accents
  music: '#7A5BFF',
  musicSoft: '#EEEAFF',
  brass: '#C8941E',
  brassSoft: '#FBEFD6',
  wizz: '#FFB020',
  wizzSoft: '#FFF1D6',

  // Feedback
  danger: '#C6362C',
  dangerSoft: '#FCEBE9',
  success: '#1C7F49',
  successSoft: '#E3F5EA',
  white: '#FFFFFF',

  // Back-compat aliases (older screens) — resolve to the new scale.
  hairlineSoft: '#EDF2F8',
  pulse: '#FFB020',
  pulseSoft: '#FFF1D6',
} as const;

/** Reserved brand gradient — logo mark and the primary CTA only. Never decoration. */
export const brandGradient = ['#2C86EE', '#1C6FD6', '#0E4EA6'] as const;

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
