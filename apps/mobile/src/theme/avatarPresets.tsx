/**
 * K-ssenger avatar composer — a Bitmoji/Notion-style character avatar you
 * build piece by piece (skin tone, hair, outfit, build) instead of picking a
 * single fixed image. Rendered as inline SVG (no hosted image files, no
 * upload, no bandwidth) so it stays crisp on every screen density and never
 * depends on an external asset host.
 *
 * Storage: a composed avatar is saved in the existing free-form `avatar_url`
 * column as `preset:<skin>.<hair>.<outfit>.<body>`, alongside the
 * pre-existing `media:<uuid>` (uploaded photo) and legacy `https://` schemes
 * already handled across the app. Avatars saved by the very first (16
 * fixed-monogram) version of this feature are still recognized and mapped
 * onto an equivalent composed config so nobody's saved avatar breaks.
 */
import React, { useMemo } from 'react';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

export type SkinId = 'ivory' | 'sand' | 'honey' | 'amber' | 'umber' | 'espresso';
export type HairId = 'buzz' | 'waves' | 'curls' | 'bun' | 'bald' | 'long';
export type OutfitId = 'crew' | 'hoodie' | 'polo' | 'turtleneck' | 'zip';
export type BodyId = 'fine' | 'standard' | 'large';

export type AvatarConfig = { skin: SkinId; hair: HairId; outfit: OutfitId; body: BodyId };

export const SKIN_TONES: { id: SkinId; label: string; color: string }[] = [
  { id: 'ivory', label: 'Ivoire', color: '#F6D2B8' },
  { id: 'sand', label: 'Sable', color: '#E3AE7D' },
  { id: 'honey', label: 'Miel', color: '#C98A55' },
  { id: 'amber', label: 'Ambre', color: '#A66A3E' },
  { id: 'umber', label: 'Terre', color: '#7A4A2B' },
  { id: 'espresso', label: 'Espresso', color: '#4A2E1D' },
];

export const HAIR_STYLES: { id: HairId; label: string; color: string }[] = [
  { id: 'buzz', label: 'Court', color: '#1B1B1F' },
  { id: 'waves', label: 'Ondulé', color: '#5B3A22' },
  { id: 'curls', label: 'Bouclé', color: '#14100D' },
  { id: 'bun', label: 'Chignon', color: '#8A3B2A' },
  { id: 'bald', label: 'Rasé', color: 'transparent' },
  { id: 'long', label: 'Long', color: '#D9A441' },
];

export const OUTFIT_STYLES: { id: OutfitId; label: string; color: string }[] = [
  { id: 'crew', label: 'Col rond', color: '#2E6FD9' },
  { id: 'hoodie', label: 'Sweat', color: '#3A3E43' },
  { id: 'polo', label: 'Polo', color: '#1C7F49' },
  { id: 'turtleneck', label: 'Col roulé', color: '#8F4A64' },
  { id: 'zip', label: 'Zippé', color: '#B93816' },
];

export const BODY_TYPES: { id: BodyId; label: string; width: number }[] = [
  { id: 'fine', label: 'Fine', width: 44 },
  { id: 'standard', label: 'Standard', width: 54 },
  { id: 'large', label: 'Large', width: 64 },
];

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = { skin: 'sand', hair: 'waves', outfit: 'crew', body: 'standard' };

const PRESET_SCHEME = 'preset:';
const SKIN_IDS = SKIN_TONES.map((s) => s.id);
const HAIR_IDS = HAIR_STYLES.map((h) => h.id);
const OUTFIT_IDS = OUTFIT_STYLES.map((o) => o.id);
const BODY_IDS = BODY_TYPES.map((b) => b.id);

// The very first shipped version stored one of these 16 ids directly. Map
// each onto a deterministic composed config so old saved avatars still
// render (as a real character now, not the old geometric monogram).
const LEGACY_IDS = [
  'orbit-cyan', 'orbit-violet', 'orbit-coral',
  'shard-gold', 'shard-teal', 'shard-rose',
  'hex-graphite', 'hex-emerald', 'hex-amber',
  'wave-indigo', 'wave-sun', 'wave-jade',
  'spark-magenta', 'spark-sky',
  'diamond-slate', 'diamond-berry',
] as const;

function configForLegacyIndex(index: number): AvatarConfig {
  return {
    skin: SKIN_IDS[index % SKIN_IDS.length],
    hair: HAIR_IDS[index % HAIR_IDS.length],
    outfit: OUTFIT_IDS[index % OUTFIT_IDS.length],
    body: BODY_IDS[index % BODY_IDS.length],
  };
}

export function encodeAvatarConfig(config: AvatarConfig): string {
  return `${PRESET_SCHEME}${config.skin}.${config.hair}.${config.outfit}.${config.body}`;
}

export function isPresetAvatarValue(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PRESET_SCHEME);
}

/** Parses a stored `avatar_url` into a composed avatar config, or null if it isn't one. */
export function decodeAvatarConfig(value: string | null | undefined): AvatarConfig | null {
  if (!isPresetAvatarValue(value)) return null;
  const body = (value as string).slice(PRESET_SCHEME.length);
  const legacyIndex = LEGACY_IDS.indexOf(body as (typeof LEGACY_IDS)[number]);
  if (legacyIndex >= 0) return configForLegacyIndex(legacyIndex);
  const [skin, hair, outfit, bodyType] = body.split('.');
  if (
    SKIN_IDS.includes(skin as SkinId) &&
    HAIR_IDS.includes(hair as HairId) &&
    OUTFIT_IDS.includes(outfit as OutfitId) &&
    BODY_IDS.includes(bodyType as BodyId)
  ) {
    return { skin: skin as SkinId, hair: hair as HairId, outfit: outfit as OutfitId, body: bodyType as BodyId };
  }
  return null;
}

/** Renders one composed character avatar as inline SVG at any pixel size, fully self-contained. */
export function AvatarGlyph({ config, size }: { config: AvatarConfig; size: number }) {
  const skin = useMemo(() => SKIN_TONES.find((s) => s.id === config.skin) ?? SKIN_TONES[0], [config.skin]);
  const hair = useMemo(() => HAIR_STYLES.find((h) => h.id === config.hair) ?? HAIR_STYLES[0], [config.hair]);
  const outfit = useMemo(() => OUTFIT_STYLES.find((o) => o.id === config.outfit) ?? OUTFIT_STYLES[0], [config.outfit]);
  const body = useMemo(() => BODY_TYPES.find((b) => b.id === config.body) ?? BODY_TYPES[1], [config.body]);
  const gradientId = `avatar-bg-${config.skin}-${config.hair}-${config.outfit}-${config.body}`;
  const w = body.width;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#15181B" />
          <Stop offset="100%" stopColor="#2A2E33" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} rx={22} fill={`url(#${gradientId})`} />

      {/* Shoulders / outfit */}
      <Polygon
        points={`${50 - w / 2},72 ${50 + w / 2},72 ${50 + w / 2 + 9},102 ${50 - w / 2 - 9},102`}
        fill={outfit.color}
      />
      {outfitDetail(outfit.id, w)}

      {/* Neck */}
      <Rect x={42} y={58} width={16} height={16} fill={skin.color} />

      {/* Head */}
      <Circle cx={50} cy={42} r={20} fill={skin.color} />

      {/* Face */}
      <Ellipse cx={42.5} cy={40} rx={2.6} ry={3.4} fill="#1B1B1F" />
      <Ellipse cx={57.5} cy={40} rx={2.6} ry={3.4} fill="#1B1B1F" />
      <Path d="M43 51 Q50 56 57 51" stroke="#1B1B1F" strokeWidth={2.4} fill="none" strokeLinecap="round" />

      {hairDetail(hair.id, hair.color)}
    </Svg>
  );
}

function outfitDetail(id: OutfitId, w: number) {
  const left = 50 - w / 2 + 8;
  const right = 50 + w / 2 - 8;
  switch (id) {
    case 'hoodie':
      return (
        <>
          <Circle cx={45} cy={80} r={1.6} fill="#000" opacity={0.35} />
          <Circle cx={55} cy={80} r={1.6} fill="#000" opacity={0.35} />
        </>
      );
    case 'polo':
      return <Path d={`M${left} 72 L50 82 L${right} 72`} stroke="#00000055" strokeWidth={1.6} fill="none" />;
    case 'turtleneck':
      return <Rect x={44} y={68} width={12} height={7} rx={3.5} fill="#00000030" />;
    case 'zip':
      return <Path d="M50 74 L50 100" stroke="#00000045" strokeWidth={1.8} />;
    case 'crew':
    default:
      return <Path d={`M${left} 73 Q50 79 ${right} 73`} stroke="#FFFFFF25" strokeWidth={1.4} fill="none" />;
  }
}

function hairDetail(id: HairId, color: string) {
  switch (id) {
    case 'buzz':
      return <Path d="M30 36 A20 20 0 0 1 70 36 L68 30 A19 19 0 0 0 32 30 Z" fill={color} />;
    case 'waves':
      return (
        <Path
          d="M29 34 Q35 16 50 18 Q65 16 71 34 Q64 26 50 27 Q36 26 29 34 Z"
          fill={color}
        />
      );
    case 'curls':
      return (
        <>
          <Circle cx={33} cy={30} r={6} fill={color} />
          <Circle cx={42} cy={24} r={6.5} fill={color} />
          <Circle cx={52} cy={21} r={6.5} fill={color} />
          <Circle cx={62} cy={24} r={6.5} fill={color} />
          <Circle cx={69} cy={31} r={6} fill={color} />
        </>
      );
    case 'bun':
      return (
        <>
          <Path d="M29 34 Q35 18 50 19 Q65 18 71 34 Q64 27 50 28 Q36 27 29 34 Z" fill={color} />
          <Circle cx={50} cy={13} r={6} fill={color} />
        </>
      );
    case 'long':
      return (
        <>
          <Path d="M29 34 Q35 17 50 18 Q65 17 71 34 Q64 26 50 27 Q36 26 29 34 Z" fill={color} />
          <Path d="M28 34 Q25 48 29 60 L35 58 Q31 46 33 33 Z" fill={color} />
          <Path d="M72 34 Q75 48 71 60 L65 58 Q69 46 67 33 Z" fill={color} />
        </>
      );
    case 'bald':
    default:
      return <Path d="M36 28 Q50 22 64 28" stroke="#FFFFFF30" strokeWidth={1.4} fill="none" />;
  }
}
