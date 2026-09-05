import React from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import App from '../App';
import { AuthScreen } from './features/auth/AuthScreen';
import { useAuthSession } from './features/auth/useAuthSession';
import { useRealtimePresence } from './features/presence/useRealtimePresence';
import { usePushRegistration } from './features/push/usePushRegistration';
import { ProfileBootstrapScreen } from './features/profile/ProfileBootstrapScreen';
import { useMyProfile } from './features/profile/useMyProfile';

export function Root() {
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

  if (profile.loading) return <Loading label="Chargement de ton profil K-ssenger…" />;
  if (profile.error) return <ProfileLoadError onRetry={profile.refresh} />;
  if (!profile.profile) return <ProfileBootstrapScreen onDone={profile.refresh} />;

  return <App profile={profile.profile} onProfileChanged={profile.refresh} />;
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
  safe: { flex: 1, backgroundColor: '#edf7fc' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  loadingText: { color: '#5d7c8e', marginTop: 12, fontWeight: '700' },
  errorTitle: { color: '#173448', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  errorCopy: { color: '#5d7c8e', marginTop: 10, textAlign: 'center', lineHeight: 20, maxWidth: 420 },
  retry: { marginTop: 18, minWidth: 150, minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5' },
  retryText: { color: '#fff', fontWeight: '900' },
});
