import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { elevation, layout, palette, radius, spacing, type as typo } from '../../theme/tokens';

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

export function ProfileBootstrapScreen({ onDone }: { onDone: () => Promise<void> | void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalizedUsername = normalizeUsername(username);
  const valid = normalizedUsername.length >= 3 && displayName.trim().length > 0 && !busy;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      const { error: rpcError } = await getBackend().rpc('ensure_my_kssenger_profile', {
        p_username: normalizedUsername,
        p_display_name: displayName.trim().slice(0, 64),
      });
      if (rpcError) {
        setError(rpcError.message.includes('USERNAME_TAKEN') ? 'Ce pseudo est déjà pris.' : 'Impossible de créer ton profil.');
        return;
      }
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await getBackend().auth.signOut();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <View style={styles.logo}><Text style={styles.logoText}>K</Text></View>
        <Text style={styles.brand}>K-SSENGER</Text>
        <Text style={styles.title}>Crée ton identité K-ssenger</Text>
        <Text style={styles.copy}>Choisis le pseudo que tes contacts verront dans leur liste.</Text>
        <TextInput autoCapitalize="none" autoCorrect={false} value={username} onChangeText={(value) => setUsername(normalizeUsername(value))} placeholder="@pseudo" maxLength={24} style={styles.input} />
        <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Nom affiché / surnom" maxLength={64} style={styles.input} onSubmitEditing={save} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={[styles.primary, !valid && styles.disabled]} disabled={!valid} onPress={save}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continuer</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={signOut}><Text style={styles.logout}>Se déconnecter</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky },
  card: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
    maxWidth: layout.maxContent + 2 * spacing.xl, alignSelf: 'center', width: '100%',
  },
  logo: { width: 76, height: 76, borderRadius: radius.xl, backgroundColor: palette.azure, alignItems: 'center', justifyContent: 'center', ...elevation.card },
  logoText: { color: palette.white, fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  brand: { marginTop: spacing.md, ...typo.brand },
  title: { marginTop: spacing.sm, ...typo.display, fontSize: 26, lineHeight: 30, textAlign: 'center' },
  copy: { ...typo.body, color: palette.inkSoft, marginTop: spacing.sm, marginBottom: spacing.lg, textAlign: 'center', maxWidth: 400 },
  input: {
    width: '100%', maxWidth: 430, backgroundColor: palette.surfaceSunken, borderWidth: 1.5, borderColor: palette.hairline,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52, marginTop: spacing.sm,
    color: palette.ink, fontSize: 15, fontWeight: '600',
  },
  primary: {
    width: '100%', maxWidth: 430, minHeight: 54, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.azure, borderRadius: radius.md, marginTop: spacing.lg, ...elevation.card,
  },
  disabled: { opacity: 0.4 },
  primaryText: { color: palette.white, fontWeight: '900', fontSize: 14.5, letterSpacing: 0.3 },
  error: { color: palette.danger, marginTop: spacing.md, textAlign: 'center', fontSize: 12.5, fontWeight: '700' },
  logout: { color: palette.inkSoft, marginTop: spacing.lg, fontWeight: '800', fontSize: 12 },
});
