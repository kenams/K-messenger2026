import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getMediaDownload } from '../../lib/media';
import { radius, spacing, type Palette } from '../../theme/tokens';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Voice-note bubble content: fetches its signed URL once, then plays/pauses in place with a scrub-free progress bar. */
export function VoiceMessageBubble({ mediaId, durationMs, mine, colors }: {
  mediaId: string;
  durationMs: number;
  mine: boolean;
  colors: Palette;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const player = useAudioPlayer(uri ?? undefined);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    let active = true;
    void getMediaDownload(mediaId)
      .then((download) => { if (active) setUri(download.url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [mediaId]);

  if (failed) return <Text style={styles.error}>⚠️ Message vocal indisponible.</Text>;

  const playing = status.playing;
  const totalMs = status.duration > 0 ? status.duration * 1000 : durationMs;
  const progress = totalMs > 0 ? Math.min(1, (status.currentTime * 1000) / totalMs) : 0;
  const remainingMs = playing || status.currentTime > 0 ? Math.max(0, totalMs - status.currentTime * 1000) : durationMs;

  const toggle = () => {
    if (!uri) return;
    if (status.didJustFinish || (!playing && status.currentTime >= (status.duration || Infinity))) void player.seekTo(0);
    playing ? player.pause() : player.play();
  };

  return (
    <Pressable
      onPress={toggle}
      disabled={!uri}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Mettre le message vocal en pause' : 'Écouter le message vocal'}
      style={styles.row}
    >
      <View style={[styles.playBtn, mine && styles.playBtnMine]}>
        {!uri ? <ActivityIndicator size="small" color={mine ? colors.inkOnAzure : colors.azureDeep} /> : (
          <Text style={[styles.playIcon, mine && styles.playIconMine]}>{playing ? '❚❚' : '▶'}</Text>
        )}
      </View>
      <View style={styles.track}>
        <View style={styles.trackBg}>
          <View style={[styles.trackFill, mine && styles.trackFillMine, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={[styles.duration, mine && styles.durationMine]}>{formatDuration(remainingMs)}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 170, paddingVertical: 2 },
    playBtn: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azureSoft },
    playBtnMine: { backgroundColor: 'rgba(255,255,255,0.22)' },
    playIcon: { fontSize: 13, color: palette.azureDeep, fontWeight: '900' },
    playIconMine: { color: palette.inkOnAzure },
    track: { flex: 1, gap: 4 },
    trackBg: { height: 4, borderRadius: radius.pill, backgroundColor: palette.hairlineStrong, overflow: 'hidden' },
    trackFill: { height: 4, borderRadius: radius.pill, backgroundColor: palette.azure },
    trackFillMine: { backgroundColor: palette.inkOnAzure },
    duration: { fontSize: 11, fontWeight: '700', color: palette.inkFaint },
    durationMine: { color: 'rgba(244,248,255,0.8)' },
    error: { color: palette.danger, fontSize: 12, fontWeight: '700' },
  });
}
