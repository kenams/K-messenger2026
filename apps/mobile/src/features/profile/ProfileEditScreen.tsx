import React, { useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import type { MyProfile } from './useMyProfile';

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 32);
}

function normalizeAvatarUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ProfileEditScreen({ profile, onSaved, onBack }: { profile: MyProfile; onSaved: () => Promise<void>; onBack: () => void }) {
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [customStatus, setCustomStatus] = useState(profile.custom_status ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const normalizedUsername = normalizeUsername(username);
  const avatar = useMemo(() => normalizeAvatarUrl(avatarUrl), [avatarUrl]);
  const avatarValid = !avatarUrl.trim() || !!avatar;
  const canSave = normalizedUsername.length >= 3 && displayName.trim().length >= 1 && avatarValid && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setNotice('');
    try {
      const { error } = await getBackend()
        .from('profiles')
        .update({
          username: normalizedUsername,
          display_name: displayName.trim().slice(0, 64),
          custom_status: customStatus.trim().slice(0, 140) || null,
          bio: bio.trim().slice(0, 500) || null,
          avatar_url: avatar,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      if (error) {
        setNotice('Impossible d’enregistrer. Le pseudo est peut-être déjà utilisé.');
        return;
      }
      await onSaved();
      setNotice('Profil enregistré.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View><Text style={styles.brand}>K-SSENGER</Text><Text style={styles.title}>Modifier mon profil</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>PSEUDO</Text>
        <TextInput autoCapitalize="none" autoCorrect={false} value={username} onChangeText={(value) => setUsername(normalizeUsername(value))} maxLength={32} placeholder="@pseudo" style={styles.input} />
        <Text style={styles.hint}>3 à 32 caractères : lettres minuscules, chiffres, point ou underscore.</Text>

        <Text style={styles.label}>NOM AFFICHÉ</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} maxLength={64} placeholder="Nom affiché" style={styles.input} />

        <Text style={styles.label}>STATUT</Text>
        <TextInput value={customStatus} onChangeText={setCustomStatus} maxLength={140} placeholder="Quoi de neuf ?" style={styles.input} />

        <Text style={styles.label}>BIO</Text>
        <TextInput value={bio} onChangeText={setBio} maxLength={500} multiline placeholder="Quelques mots sur toi" style={[styles.input, styles.multiline]} />

        <Text style={styles.label}>AVATAR HTTPS</Text>
        <TextInput autoCapitalize="none" autoCorrect={false} value={avatarUrl} onChangeText={setAvatarUrl} placeholder="https://…" style={styles.input} />
        <Text style={[styles.hint, !avatarValid && styles.error]}>L’upload photo natif sera branché sur le stockage K-ssenger ; en attendant, seules les URL HTTPS sont acceptées.</Text>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        <TouchableOpacity disabled={!canSave} onPress={() => void save()} style={[styles.primary, !canSave && styles.disabled]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Enregistrer</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, back: { fontSize: 39, color: '#2189c5' }, brand: { color: '#3784b5', fontSize: 9, letterSpacing: 2, fontWeight: '900' }, title: { color: '#173448', fontSize: 18, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 40 }, label: { marginTop: 16, marginBottom: 6, color: '#52768a', fontSize: 10, letterSpacing: 1.2, fontWeight: '900' }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cee2ed', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12, color: '#173448' }, multiline: { minHeight: 100, textAlignVertical: 'top' }, hint: { color: '#8197a4', fontSize: 10, lineHeight: 14, marginTop: 5 }, error: { color: '#b42318' }, notice: { marginTop: 16, color: '#326e94', fontWeight: '700' },
  primary: { minHeight: 48, marginTop: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5', borderRadius: 16 }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: 0.45 },
});
