// Web build of K-Live. Native (Android/iOS) uses LiveScreen.native.tsx —
// Metro picks the right file per platform automatically. LiveKit's browser
// SDK (@livekit/components-react) renders plain HTML under react-native-web,
// so it drops straight into this RN screen without a native bridge.
import '@livekit/components-styles';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioConference, LiveKitRoom, VideoConference, useTracks } from '@livekit/components-react';
import { MediaDeviceFailure, Track } from 'livekit-client';
import { StatusBar } from 'expo-status-bar';
import { useLiveSocket, type LiveSession } from './useLiveSocket';
import { ensureLiveKitTheme } from './liveKitTheme.web';
import { radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

export function LiveScreen({ broadcasterId, onClose }: { broadcasterId: string | null; onClose: () => void }) {
  const { styles, colors, scheme } = useThemedStyles();
  // LiveKit's control bar only reads its brand colours from
  // `[data-lk-theme=default]` — without it (the previous state) every
  // control fell back to unstyled defaults. `.kssenger-live` below then
  // overrides those vars with K-ssenger's own navy/gold/ivory palette.
  useEffect(() => {
    ensureLiveKitTheme(scheme === 'dark');
  }, [scheme]);
  const { startLive, joinLive, stopLive } = useLiveSocket();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Broadcaster-only choice: no webcam available (Kenams' and the test
  // environment's machines both lack one) shouldn't mean K-Live is unusable —
  // "Audio seulement" requests only the mic (getUserMedia({ audio: true })),
  // never touches the camera, and viewers still join and hear the stream via
  // AudioConference (no video tile expected/rendered).
  const [mode, setMode] = useState<'video' | 'audio'>('video');
  const isBroadcaster = !broadcasterId;
  const wantsVideo = isBroadcaster && mode === 'video';
  const wantsAudio = isBroadcaster; // viewers never publish; they only subscribe

  const begin = async () => {
    setBusy(true);
    setError('');
    try {
      setSession(isBroadcaster ? await startLive() : await joinLive(broadcasterId as string));
    } catch (e) {
      setError(e instanceof Error && e.message === 'LIVE_NOT_CONFIGURED'
        ? 'Le live n’est pas encore disponible.'
        : 'Connexion au live impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const end = () => {
    setSession(null);
    if (isBroadcaster) void stopLive().catch(() => {});
    onClose();
  };

  // Camera/mic failure (permission refusée, aucun device, device occupé) or
  // any other room error used to fail silently: LiveKitRoom had no
  // onError/onMediaDeviceFailure handler, so the SDK's internal disconnect
  // fell through to onDisconnected → end() → back to "Moi" with zero
  // feedback. These two handlers surface a clear message instead, and drop
  // back to the pre-join screen (not onClose) so the user can retry.
  const fail = (message: string) => {
    if (isBroadcaster) void stopLive().catch(() => {});
    setSession(null);
    setError(message);
  };

  const mediaFailureMessage: Record<MediaDeviceFailure, string> = {
    [MediaDeviceFailure.PermissionDenied]:
      'Accès à la caméra/au micro refusé. Autorise-les dans les paramètres du navigateur puis réessaie.',
    [MediaDeviceFailure.NotFound]: 'Aucune caméra ou micro détecté sur cet appareil.',
    [MediaDeviceFailure.DeviceInUse]: 'Caméra ou micro déjà utilisé par une autre application.',
    [MediaDeviceFailure.Other]: 'Impossible d’accéder à la caméra ou au micro.',
  };

  if (session) {
    return (
      <LiveKitRoom
        serverUrl={session.url}
        token={session.token}
        connect
        video={wantsVideo}
        audio={wantsAudio}
        onDisconnected={end}
        onError={() => fail('Connexion au live interrompue. Réessaie dans un instant.')}
        onMediaDeviceFailure={(failure) =>
          fail(failure ? mediaFailureMessage[failure] : mediaFailureMessage[MediaDeviceFailure.Other])
        }
        style={styles.room as never}
        className="kssenger-live"
        data-lk-theme="default"
      >
        <AudioOnlyBadge style={styles.audioBadge} textStyle={styles.audioBadgeText} />
        {isBroadcaster && mode === 'audio' ? <AudioConference /> : <VideoConference />}
      </LiveKitRoom>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.centre}>
        <Text style={styles.title}>{isBroadcaster ? 'Démarrer un K-Live' : 'Rejoindre le live'}</Text>
        <Text style={styles.lede}>
          {isBroadcaster
            ? 'Tes contacts seront prévenus dès que tu passes en direct.'
            : 'Tu rejoins en tant que spectateur.'}
        </Text>
        {isBroadcaster && (
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'video' && styles.modeButtonActive]}
              onPress={() => setMode('video')}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'video' }}
            >
              <Text style={[styles.modeButtonText, mode === 'video' && styles.modeButtonTextActive]}>📷 Avec caméra</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'audio' && styles.modeButtonActive]}
              onPress={() => setMode('audio')}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'audio' }}
            >
              <Text style={[styles.modeButtonText, mode === 'audio' && styles.modeButtonTextActive]}>🎙️ Audio seulement</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity disabled={busy} style={styles.cta} onPress={() => void begin()} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.ctaText}>{isBroadcaster ? 'Passer en direct' : 'Rejoindre'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/**
 * Shown to broadcaster and viewers alike: true whenever nobody in the room
 * currently publishes a camera track, which covers both the explicit
 * "Audio seulement" broadcaster choice and a viewer joining before/without
 * ever seeing a video track. Keeps the room visibly "live" instead of a
 * blank/black tile when there is genuinely no picture to show.
 */
function AudioOnlyBadge({ style, textStyle }: { style: unknown; textStyle: unknown }) {
  const cameraTracks = useTracks([Track.Source.Camera]);
  if (cameraTracks.length > 0) return null;
  return (
    <View style={style as never} pointerEvents="none">
      <Text style={textStyle as never}>🔴 En direct · Audio seul</Text>
    </View>
  );
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surface },
  room: { flex: 1, minHeight: 400, position: 'relative' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { ...typo.title, color: palette.ink, textAlign: 'center' },
  lede: { ...typo.body, color: palette.inkSoft, textAlign: 'center' },
  error: { ...typo.body, color: palette.danger, textAlign: 'center' },
  cta: { backgroundColor: palette.azure, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minWidth: 220, alignItems: 'center' },
  ctaText: { color: palette.white, fontWeight: '900', fontSize: 15 },
  cancel: { paddingVertical: spacing.sm },
  cancelText: { color: palette.inkSoft, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modeButton: {
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: palette.hairlineStrong,
    backgroundColor: palette.surfaceRaised,
  },
  modeButtonActive: { borderColor: palette.azure, backgroundColor: palette.azureSoft },
  modeButtonText: { color: palette.inkSoft, fontWeight: '700', fontSize: 13 },
  modeButtonTextActive: { color: palette.azureDeep },
  audioBadge: {
    position: 'absolute',
    top: spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  audioBadgeText: {
    backgroundColor: 'rgba(9,12,20,0.72)',
    color: '#FFF8EC',
    fontWeight: '800',
    fontSize: 12.5,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(214,179,106,0.4)',
    overflow: 'hidden',
  },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
