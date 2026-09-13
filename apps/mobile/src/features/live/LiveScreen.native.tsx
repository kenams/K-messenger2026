// Native (Android/iOS) build of K-Live. Web uses LiveScreen.tsx — Metro
// picks the right file per platform automatically. Rendering is native
// (@livekit/react-native's VideoTrack, backed by RTCView), room state comes
// from @livekit/components-react's platform-agnostic hooks (logic only, no
// DOM) via the LiveKitRoom context both packages share.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Track } from 'livekit-client';
import { LiveKitRoom, VideoTrack, registerGlobals, useTracks } from '@livekit/react-native';
import { StatusBar } from 'expo-status-bar';
import { useLiveSocket, type LiveSession } from './useLiveSocket';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';

let globalsRegistered = false;
function ensureGlobals() {
  if (globalsRegistered) return;
  registerGlobals();
  globalsRegistered = true;
}

function LiveStage({ isBroadcaster, onLeave }: { isBroadcaster: boolean; onLeave: () => void }) {
  const tracks = useTracks([Track.Source.Camera]);
  return (
    <View style={styles.stage}>
      {tracks.length === 0 && (
        <View style={styles.waiting}>
          <ActivityIndicator color={palette.white} />
          <Text style={styles.waitingText}>{isBroadcaster ? 'Caméra en cours d’activation…' : 'En attente du direct…'}</Text>
        </View>
      )}
      {tracks.map((t) => (
        <VideoTrack key={t.publication?.trackSid ?? t.participant.identity} trackRef={t} style={styles.video} objectFit="cover" mirror={isBroadcaster} />
      ))}
      <TouchableOpacity style={styles.leave} onPress={onLeave} accessibilityRole="button">
        <Text style={styles.leaveText}>{isBroadcaster ? 'Arrêter le direct' : 'Quitter'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function LiveScreen({ broadcasterId, onClose }: { broadcasterId: string | null; onClose: () => void }) {
  const { startLive, joinLive, stopLive } = useLiveSocket();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isBroadcaster = !broadcasterId;

  useEffect(() => { ensureGlobals(); }, []);

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
      <LiveKitRoom serverUrl={session.url} token={session.token} connect video={isBroadcaster} audio={isBroadcaster} onDisconnected={end}>
        <LiveStage isBroadcaster={isBroadcaster} onLeave={end} />
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
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { ...typo.title, color: palette.ink, textAlign: 'center' },
  lede: { ...typo.body, color: palette.inkSoft, textAlign: 'center' },
  error: { ...typo.body, color: palette.danger, textAlign: 'center' },
  cta: { backgroundColor: palette.azure, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minWidth: 220, alignItems: 'center' },
  ctaText: { color: palette.white, fontWeight: '900', fontSize: 15 },
  cancel: { paddingVertical: spacing.sm },
  cancelText: { color: palette.inkSoft, fontWeight: '700' },
  stage: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1 },
  waiting: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  waitingText: { color: palette.white, fontWeight: '700' },
  leave: { position: 'absolute', bottom: spacing.xl, alignSelf: 'center', backgroundColor: palette.danger, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  leaveText: { color: palette.white, fontWeight: '900' },
});
