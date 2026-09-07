/**
 * K-ssenger design tokens — "MSN-2026".
 *
 * One nostalgic buddy-list feel, modernised: deep azure ink, a vivid presence
 * green, glass panels over a soft sky wash, and a dedicated violet reserved for
 * the live "now playing" signature. Every screen pulls colour, spacing, radius,
 * type and elevation from here so the app reads as a single product.
 */

export const palette = {
  // Brand
  azure: '#1E7FD4',
  azureDeep: '#166CB8',
  azureSoft: '#E4F1FB',
  ink: '#12303F',
  inkSoft: '#4A6B7C',
  inkFaint: '#7C97A6',

  // Surfaces
  sky: '#EEF6FC',
  skyTop: '#E3F1FB',
  skyBottom: '#F5FAFD',
  surface: '#FFFFFF',
  glass: 'rgba(255,255,255,0.74)',
  hairline: '#D8E7F1',
  hairlineSoft: '#EAF2F7',

  // Presence
  online: '#33C75A',
  onlineRing: '#B8ECC6',
  busy: '#E5484D',
  away: '#F5A524',
  invisible: '#9AA9B2',
  offline: '#B4C2CB',

  // Accents
  pulse: '#FFC53D',
  pulseSoft: '#FFF3D1',
  music: '#7C5CFF',
  musicSoft: '#EDE8FF',

  // Feedback
  danger: '#C4342B',
  dangerSoft: '#FDECEA',
  success: '#1F7A45',
  white: '#FFFFFF',
} as const;

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
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const type = {
  brand: { fontSize: 10, letterSpacing: 2.4, fontWeight: '900' as const, color: palette.azure },
  label: { fontSize: 10, letterSpacing: 1.3, fontWeight: '900' as const, color: palette.inkSoft },
  title: { fontSize: 22, fontWeight: '900' as const, color: palette.ink },
  heading: { fontSize: 17, fontWeight: '900' as const, color: palette.ink },
  name: { fontSize: 15, fontWeight: '800' as const, color: palette.ink },
  body: { fontSize: 14, fontWeight: '500' as const, color: palette.ink, lineHeight: 20 },
  meta: { fontSize: 12, fontWeight: '500' as const, color: palette.inkSoft },
  micro: { fontSize: 10, fontWeight: '700' as const, color: palette.inkFaint },
} as const;

export const elevation = {
  card: {
    shadowColor: '#123A52',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#0F3247',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

export const motion = {
  fast: 160,
  base: 240,
  slow: 420,
} as const;
