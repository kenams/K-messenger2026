import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend, isBackendConfigured } from '../../lib/backend';

type Mode = 'login' | 'signup';

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const normalizedUsername = normalizeUsername(username);
  const signupIdentityValid = mode === 'login' || (normalizedUsername.length >= 3 && displayName.trim().length >= 1);
  const canSubmit = !!email.trim() && password.length >= 8 && signupIdentityValid && !busy && isBackendConfigured;

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!canSubmit || !normalizedEmail) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const backend = getBackend();
      if (mode === 'login') {
        const { error: authError } = await backend.auth.signInWithPassword({ email: normalizedEmail, password });
        if (authError) setError('Connexion impossible. Vérifie ton e-mail et ton mot de passe.');
      } else {
        const { data, error: authError } = await backend.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { username: normalizedUsername, display_name: displayName.trim().slice(0, 64) } },
        });
        if (authError) setError('Création du compte impossible. Essaie un autre pseudo ou réessaie dans un instant.');
        else if (!data.session) setNotice('Compte créé. Confirme ton e-mail pour te connecter.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isBackendConfigured) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.card}>
          <View style={styles.logo}><Text style={styles.logoText}>K</Text></View>
          <Text style={styles.brand}>K-SSENGER</Text>
          <Text style={styles.title}>Backend K-ssenger non configuré</Text>
          <Text style={styles.copy}>L’app mobile attend uniquement les endpoints publics du backend Neon dédié à K-ssenger.</Text>
          <Text style={styles.code}>EXPO_PUBLIC_NEON_AUTH_URL</Text>
          <Text style={styles.code}>EXPO_PUBLIC_NEON_DATA_API_URL</Text>
          <Text style={styles.warning}>Aucune base d’un autre projet ne sera utilisée.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <View style={styles.logo}><Text style={styles.logoText}>K</Text></View>
        <Text style={styles.brand}>K-SSENGER</Text>
        <Text style={styles.title}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</Text>
        <Text style={styles.copy}>La messagerie sociale qui remet les contacts au centre.</Text>

        {mode === 'signup' && <>
          <TextInput autoCapitalize="none" autoCorrect={false} placeholder="@pseudo (3 caractères minimum)" value={username} onChangeText={(value) => setUsername(normalizeUsername(value))} maxLength={24} style={styles.input} />
          <TextInput autoCorrect={false} placeholder="Nom affiché / surnom" value={displayName} onChangeText={setDisplayName} maxLength={64} style={styles.input} />
        </>}

        <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="E-mail" value={email} onChangeText={setEmail} style={styles.input} />
        <TextInput autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Mot de passe (8 caractères minimum)" value={password} onChangeText={setPassword} style={styles.input} onSubmitEditing={submit} />

        {mode === 'signup' && normalizedUsername.length > 0 && normalizedUsername.length < 3 && <Text style={styles.hint}>Le pseudo doit contenir au moins 3 caractères.</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        <TouchableOpacity style={[styles.primary, !canSubmit && styles.disabled]} disabled={!canSubmit} onPress={submit}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{mode === 'login' ? 'Connexion' : 'Créer mon compte'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice(''); }}>
          <Text style={styles.switch}>{mode === 'login' ? 'Pas encore de compte ? Inscription' : 'Déjà un compte ? Connexion'}</Text>
        </TouchableOpacity>

        <Text style={styles.foot}>Les secrets serveur ne sont jamais embarqués dans l’application.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, card: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  logo: { width: 82, height: 82, borderRadius: 28, backgroundColor: '#278dcc', borderWidth: 5, borderColor: '#bfe8ff', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 37, fontWeight: '900' }, brand: { marginTop: 10, color: '#3784b5', fontSize: 10, letterSpacing: 2.2, fontWeight: '900' },
  title: { marginTop: 22, color: '#15364a', fontSize: 27, fontWeight: '900', textAlign: 'center' }, copy: { color: '#648292', marginTop: 8, marginBottom: 18, textAlign: 'center' },
  input: { width: '100%', maxWidth: 430, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cee2ed', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 13, marginTop: 9 },
  primary: { width: '100%', maxWidth: 430, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5', borderRadius: 16, marginTop: 16 },
  disabled: { opacity: 0.5 }, primaryText: { color: '#fff', fontWeight: '900' }, switch: { color: '#278dcc', fontWeight: '800', marginTop: 18 },
  hint: { color: '#7b5d00', marginTop: 8, textAlign: 'center', fontSize: 11 }, error: { color: '#b42318', marginTop: 12, textAlign: 'center' },
  notice: { color: '#217a45', marginTop: 12, textAlign: 'center' }, foot: { color: '#8197a4', fontSize: 10, marginTop: 18, textAlign: 'center' },
  code: { marginTop: 6, color: '#345c74', fontFamily: 'monospace' }, warning: { marginTop: 16, color: '#7b4d00', fontWeight: '800', textAlign: 'center' },
});
