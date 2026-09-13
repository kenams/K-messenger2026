// Web build of K-Live. Native (Android/iOS) uses LiveScreen.native.tsx —
// Metro picks the right file per platform automatically. LiveKit's browser
// SDK (@livekit/components-react) renders plain HTML under react-native-web,
// so it drops straight into this RN screen without a native bridge.
import '@livekit/components-styles';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { StatusBar } from 'expo-status-bar';
import { useLiveSocket, type LiveSession } from './useLiveSocket';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';

export function LiveScreen({ broadcasterId, onClose }: { broadcasterId: string | null; onClose: () => void }) {
  const { startLive, joinLive, stopLive } = useLiveSocket();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isBroadcaster = !broadcasterId;

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

  if (session) {
    return (
      <LiveKitRoom
        serverUrl={session.url}
        token={session.token}
        connect
        video={isBroadcaster}
        audio={isBroadcaster}
        onDisconnected={end}
        style={styles.room as never}
      >
        <VideoConference />
      </LiveKitRoom>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.centre}>
        <Text style={styles.title}>{isBroadcaster ? 'Démarrer un K-Live' : 'Rejoindre le live'}</Text>
        <Text style={styles.lede}>
          {isBroadcaster
            ? 'Tes contacts seront prévenus dès que tu passes en direct.'
            : 'Tu rejoins en tant que spectateur.'}
        </Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity disabled={busy} style={styles.cta} onPress={() => void begin()} accessibilityRole="button">
          {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.ctaText}>{isBroadcaster ? 'Passer en direct' : 'Rejoindre'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surface },
  room: { flex: 1, minHeight: 400 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { ...typo.title, color: palette.ink, textAlign: 'center' },
  lede: { ...typo.body, color: palette.inkSoft, textAlign: 'center' },
  error: { ...typo.body, color: palette.danger, textAlign: 'center' },
  cta: { backgroundColor: palette.azure, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minWidth: 220, alignItems: 'center' },
  ctaText: { color: palette.white, fontWeight: '900', fontSize: 15 },
  cancel: { paddingVertical: spacing.sm },
  cancelText: { color: palette.inkSoft, fontWeight: '700' },
});
