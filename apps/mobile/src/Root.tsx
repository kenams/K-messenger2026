import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import App from '../App';
import { AuthScreen } from './features/auth/AuthScreen';
import { useAuthSession } from './features/auth/useAuthSession';
import { useRealtimePresence } from './features/presence/useRealtimePresence';
import { usePushRegistration } from './features/push/usePushRegistration';
import { ProfileBootstrapScreen } from './features/profile/ProfileBootstrapScreen';
import { useMyProfile } from './features/profile/useMyProfile';
import { useKPulse } from './features/kpulse/KPulseBurst';
import { useKPulseReceiver } from './features/kpulse/useKPulseReceiver';

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.loading}>
          <Text style={styles.errorTitle}>K-ssenger n’a pas pu démarrer</Text>
          <Text style={styles.errorCopy}>{this.state.error.message || String(this.state.error)}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => this.setState({ error: null })} accessibilityRole="button">
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}

export function Root() {
  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <RootInner />
      </RootErrorBoundary>
    </SafeAreaProvider>
  );
}

function RootInner() {
  const auth = useAuthSession();

  if (!auth.configured) return <AuthScreen />;
  if (auth.loading) return <Loading label="Connexion à K-ssenger…" />;
  if (!auth.session) return <AuthScreen />;

  return <AuthenticatedRoot userId={auth.session.user.id} />;
}

function AuthenticatedRoot({ userId }: { userId: string }) {
  useRealtimePresence();
  usePushRegistration(userId);
  const profile = useMyProfile(userId);
  const { fire: fireKPulse, node: kpulseNode } = useKPulse();
  useKPulseReceiver(fireKPulse);

  if (profile.loading) return <Loading label="Chargement de ton profil K-ssenger…" />;
  if (profile.error) return <ProfileLoadError onRetry={profile.refresh} />;
  if (!profile.profile) return <ProfileBootstrapScreen onDone={profile.refresh} />;

  return (
    <>
      {kpulseNode}
      <App profile={profile.profile} onProfileChanged={profile.refresh} />
    </>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

function ProfileLoadError({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.loading}>
        <Text style={styles.errorTitle}>Connexion au profil impossible</Text>
        <Text style={styles.errorCopy}>Ton compte existe toujours. K-ssenger n’essaiera pas de recréer ton profil à cause d’une erreur réseau.</Text>
        <TouchableOpacity style={styles.retry} onPress={() => void onRetry()} accessibilityRole="button">
          <Text style={styles.retryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F4EC' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  loadingText: { color: '#4A4032', marginTop: 12, fontWeight: '700' },
  errorTitle: { color: '#1C140B', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  errorCopy: { color: '#4A4032', marginTop: 10, textAlign: 'center', lineHeight: 20, maxWidth: 420 },
  retry: { marginTop: 18, minWidth: 150, minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A67C3D' },
  retryText: { color: '#fff', fontWeight: '900' },
});
