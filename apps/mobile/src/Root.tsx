import React from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import App from '../App';
import { AuthScreen } from './features/auth/AuthScreen';
import { useAuthSession } from './features/auth/useAuthSession';
import { useRealtimePresence } from './features/presence/useRealtimePresence';
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
  const profile = useMyProfile(userId);

  if (profile.loading) return <Loading label="Chargement de ton profil K-ssenger…" />;
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#5d7c8e', marginTop: 12, fontWeight: '700' },
});
