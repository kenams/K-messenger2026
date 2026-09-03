import React from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import App from '../App';
import { AuthScreen } from './features/auth/AuthScreen';
import { useAuthSession } from './features/auth/useAuthSession';

export function Root() {
  const auth = useAuthSession();

  if (!auth.configured) return <AuthScreen />;

  if (auth.loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Connexion à K-ssenger…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!auth.session) return <AuthScreen />;

  return <App />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#5d7c8e', marginTop: 12, fontWeight: '700' },
});
