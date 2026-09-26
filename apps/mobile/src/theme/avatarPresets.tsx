/**
 * K-ssenger preset avatar library — an alternative identity mark for anyone
 * who doesn't want a real photo. Rendered as inline SVG (no hosted image
 * files, no upload, no bandwidth) so it stays crisp on every screen density
 * and never depends on an external asset host.
 *
 * Each preset is a monogram-style abstract mark: a gradient field plus one
 * clean geometric motif, in the spirit of a brand identity system rather
 * than a cartoon face or a generic emoji. The palette is deliberately its
 * own — distinct from the five theme skins — so a chosen avatar reads the
 * same regardless of which theme skin the viewer has selected.
 *
 * Storage: a preset is saved in the existing free-form `avatar_url` column
 * as `preset:<id>`, alongside the pre-existing `media:<uuid>` (uploaded
 * photo) and legacy `https://` schemes already handled across the app.
 */
import React, { useMemo } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

export type AvatarPresetId =
  | 'orbit-cyan' | 'orbit-violet' | 'orbit-coral'
  | 'shard-gold' | 'shard-teal' | 'shard-rose'
  | 'hex-graphite' | 'hex-emerald' | 'hex-amber'
  | 'wave-indigo' | 'wave-sun' | 'wave-jade'
  | 'spark-magenta' | 'spark-sky'
  | 'diamond-slate' | 'diamond-berry';

type Motif = 'orbit' | 'shard' | 'hex' | 'wave' | 'spark' | 'diamond';

const PRESET_DEFS: { id: AvatarPresetId; motif: Motif; from: string; to: string; mark: string }[] = [
  { id: 'orbit-cyan', motif: 'orbit', from: '#123B44', to: '#0E7681', mark: '#7FE7EF' },
  { id: 'orbit-violet', motif: 'orbit', from: '#241A47', to: '#5F3FE0', mark: '#C7B8FF' },
  { id: 'orbit-coral', motif: 'orbit', from: '#3F1B18', to: '#D9431F', mark: '#FFC9B8' },
  { id: 'shard-gold', motif: 'shard', from: '#2B2210', to: '#A67C3D', mark: '#FDEBC4' },
  { id: 'shard-teal', motif: 'shard', from: '#0E2A2C', to: '#22AE9C', mark: '#BFF3E9' },
  { id: 'shard-rose', motif: 'shard', from: '#3A1526', to: '#A85B77', mark: '#FBD3E1' },
  { id: 'hex-graphite', motif: 'hex', from: '#15181B', to: '#3A3E43', mark: '#2DD4DE' },
  { id: 'hex-emerald', motif: 'hex', from: '#0D2318', to: '#1C7F49', mark: '#B7F0CD' },
  { id: 'hex-amber', motif: 'hex', from: '#2E1F08', to: '#B93816', mark: '#FFD9A0' },
  { id: 'wave-indigo', motif: 'wave', from: '#161233', to: '#4C2FC4', mark: '#E0D9FF' },
  { id: 'wave-sun', motif: 'wave', from: '#301C08', to: '#F0A400', mark: '#FFF0C7' },
  { id: 'wave-jade', motif: 'wave', from: '#0B211D', to: '#00838E', mark: '#B7ECEF' },
  { id: 'spark-magenta', motif: 'spark', from: '#2C0F24', to: '#D9438F', mark: '#FFD4EC' },
  { id: 'spark-sky', motif: 'spark', from: '#0D1D33', to: '#2E6FD9', mark: '#CFE3FF' },
  { id: 'diamond-slate', motif: 'diamond', from: '#101317', to: '#4B535A', mark: '#DDE2E6' },
  { id: 'diamond-berry', motif: 'diamond', from: '#28102A', to: '#8F4A64', mark: '#F4D2DE' },
];

export const AVATAR_PRESET_IDS: AvatarPresetId[] = PRESET_DEFS.map((preset) => preset.id);

const PRESET_SCHEME = 'preset:';

export function isPresetAvatarValue(value: string | null | undefined): value is `preset:${AvatarPresetId}` {
  return !!value && value.startsWith(PRESET_SCHEME) && AVATAR_PRESET_IDS.includes(value.slice(PRESET_SCHEME.length) as AvatarPresetId);
}

export function presetIdFromAvatar(value: string | null | undefined): AvatarPresetId | null {
  if (!isPresetAvatarValue(value)) return null;
  return value.slice(PRESET_SCHEME.length) as AvatarPresetId;
}

export function presetAvatarValue(id: AvatarPresetId): string {
  return `${PRESET_SCHEME}${id}`;
}

function motifShape(motif: Motif, mark: string) {
  switch (motif) {
    case 'orbit':
      return (
        <>
          <Circle cx={50} cy={50} r={26} stroke={mark} strokeWidth={4} fill="none" opacity={0.55} />
          <Circle cx={50} cy={24} r={7} fill={mark} />
        </>
      );
    case 'shard':
      return <Polygon points="50,16 78,44 62,84 38,84 22,44" fill={mark} opacity={0.9} />;
    case 'hex':
      return <Polygon points="50,14 82,32 82,68 50,86 18,68 18,32" stroke={mark} strokeWidth={4.5} fill="none" />;
    case 'wave':
      return <Path d="M14 58 C 30 38, 40 78, 56 58 C 72 38, 82 78, 92 58" stroke={mark} strokeWidth={6} fill="none" strokeLinecap="round" />;
    case 'spark':
      return <Polygon points="50,10 58,42 90,50 58,58 50,90 42,58 10,50 42,42" fill={mark} />;
    case 'diamond':
      return <Rect x={30} y={30} width={40} height={40} rx={8} fill={mark} opacity={0.92} transform="rotate(45 50 50)" />;
    default:
      return null;
  }
}

/** Renders one preset avatar mark as inline SVG at any pixel size, fully self-contained. */
export function PresetAvatarGlyph({ id, size }: { id: AvatarPresetId; size: number }) {
  const preset = useMemo(() => PRESET_DEFS.find((entry) => entry.id === id) ?? PRESET_DEFS[0], [id]);
  const gradientId = `avatar-grad-${preset.id}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={preset.from} />
          <Stop offset="100%" stopColor={preset.to} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} rx={22} fill={`url(#${gradientId})`} />
      {motifShape(preset.motif, preset.mark)}
    </Svg>
  );
}
