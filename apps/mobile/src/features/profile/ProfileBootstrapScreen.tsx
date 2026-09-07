import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';

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
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  logo: { width: 82, height: 82, borderRadius: radius.xl, backgroundColor: palette.azure, borderWidth: 5, borderColor: palette.azureSoft, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: palette.white, fontSize: 37, fontWeight: '900' },
  brand: { marginTop: spacing.sm, ...typo.brand, fontSize: 10, letterSpacing: 2.2 },
  title: { marginTop: spacing.xl, color: palette.ink, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  copy: { color: palette.inkSoft, marginTop: spacing.sm, marginBottom: spacing.lg, textAlign: 'center', maxWidth: 400 },
  input: { width: '100%', maxWidth: 430, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginTop: spacing.sm, color: palette.ink },
  primary: { width: '100%', maxWidth: 430, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure, borderRadius: radius.lg, marginTop: spacing.lg },
  disabled: { opacity: 0.5 },
  primaryText: { color: palette.white, fontWeight: '900' },
  error: { color: palette.danger, marginTop: spacing.md, textAlign: 'center' },
  logout: { color: palette.inkSoft, marginTop: spacing.lg, fontWeight: '700' },
});
