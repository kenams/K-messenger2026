import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import type { MyProfile } from './useMyProfile';

const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MIMES = new Set<SupportedMediaMime>(['image/jpeg', 'image/png', 'image/webp']);

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

function isHttpsAvatarUrl(value: string | null | undefined): value is string {
  return !!value && /^https:\/\//i.test(value);
}

function inferAvatarMime(asset: ImagePicker.ImagePickerAsset): SupportedMediaMime | null {
  const normalized = asset.mimeType?.toLowerCase();
  if (normalized && IMAGE_MIMES.has(normalized as SupportedMediaMime)) return normalized as SupportedMediaMime;
  const uri = asset.uri.toLowerCase();
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.webp')) return 'image/webp';
  if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

export function ProfileEditScreen({ profile, onSaved, onBack }: { profile: MyProfile; onSaved: () => Promise<void>; onBack: () => void }) {
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [customStatus, setCustomStatus] = useState(profile.custom_status ?? '');
  const [nowPlayingTitle, setNowPlayingTitle] = useState(profile.now_playing_title ?? '');
  const [nowPlayingArtist, setNowPlayingArtist] = useState(profile.now_playing_artist ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(isHttpsAvatarUrl(profile.avatar_url) ? profile.avatar_url : '');
  const [avatarMediaId, setAvatarMediaId] = useState(profile.avatar_media_id);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(isHttpsAvatarUrl(profile.avatar_url) ? profile.avatar_url : null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const normalizedUsername = normalizeUsername(username);
  const avatar = useMemo(() => normalizeAvatarUrl(avatarUrl), [avatarUrl]);
  const avatarValid = !avatarUrl.trim() || !!avatar;
  const canSave = normalizedUsername.length >= 3 && displayName.trim().length >= 1 && avatarValid && !busy && !avatarBusy;

  useEffect(() => {
    let active = true;
    if (!avatarMediaId) {
      setAvatarPreviewUri(avatar);
      return () => { active = false; };
    }
    setAvatarPreviewUri(null);
    void getMediaDownload(avatarMediaId)
      .then((download) => { if (active) setAvatarPreviewUri(download.url); })
      .catch(() => { if (active) setAvatarPreviewUri(null); });
    return () => { active = false; };
  }, [avatarMediaId, avatar]);

  const setHttpsAvatar = (value: string) => {
    setAvatarUrl(value);
    setAvatarMediaId(null);
  };

  const clearAvatar = () => {
    setAvatarUrl('');
    setAvatarMediaId(null);
    setAvatarPreviewUri(null);
  };

  const pickAvatar = async () => {
    if (avatarBusy || busy) return;
    setAvatarBusy(true);
    setNotice('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice('Autorise l\'acces aux photos pour choisir un avatar K-ssenger.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset?.uri) throw new Error('UNSUPPORTED_AVATAR');
      const mimeType = inferAvatarMime(asset);
      if (!asset.fileSize || !mimeType || asset.fileSize > AVATAR_MAX_BYTES) throw new Error('UNSUPPORTED_AVATAR');
      const { mediaId } = await uploadLocalMedia({
        uri: asset.uri,
        mimeType,
        byteSize: asset.fileSize,
        purpose: 'avatar',
      });
      setAvatarUrl('');
      setAvatarPreviewUri(asset.uri);
      setAvatarMediaId(mediaId);
      setNotice('Avatar importe. Enregistre le profil pour le publier.');
    } catch {
      setNotice('Upload avatar impossible. Formats acceptes : JPG, PNG ou WebP, 10 Mo maximum.');
    } finally {
      setAvatarBusy(false);
    }
  };

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
          now_playing_title: nowPlayingTitle.trim().slice(0, 120) || null,
          now_playing_artist: nowPlayingArtist.trim().slice(0, 120) || null,
          bio: bio.trim().slice(0, 500) || null,
          avatar_url: avatarMediaId ? `media:${avatarMediaId}` : avatar,
          avatar_media_id: avatarMediaId,
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

        <Text style={styles.label}>MUSIQUE EN COURS</Text>
        <TextInput value={nowPlayingTitle} onChangeText={setNowPlayingTitle} maxLength={120} placeholder="Titre du morceau" style={styles.input} />
        <TextInput value={nowPlayingArtist} onChangeText={setNowPlayingArtist} maxLength={120} placeholder="Artiste" style={[styles.input, styles.stackedInput]} />
        <Text style={styles.hint}>♫ Affiché à tes contacts selon tes réglages de confidentialité.</Text>

        <Text style={styles.label}>BIO</Text>
        <TextInput value={bio} onChangeText={setBio} maxLength={500} multiline placeholder="Quelques mots sur toi" style={[styles.input, styles.multiline]} />

        <Text style={styles.label}>AVATAR</Text>
        <View style={styles.avatarRow}>
          {avatarPreviewUri
            ? <Image source={{ uri: avatarPreviewUri }} style={styles.avatarPreview} />
            : <View style={styles.avatarPreview}><Text style={styles.avatarPreviewText}>{displayName[0]?.toUpperCase() ?? 'K'}</Text></View>}
          <View style={styles.avatarActions}>
            <TouchableOpacity disabled={avatarBusy || busy} onPress={() => void pickAvatar()} style={[styles.avatarButton, (avatarBusy || busy) && styles.disabled]}>
              {avatarBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.avatarButtonText}>Choisir une photo</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={avatarBusy || busy} onPress={clearAvatar} style={styles.avatarSecondary}>
              <Text style={styles.avatarSecondaryText}>Retirer</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TextInput autoCapitalize="none" autoCorrect={false} value={avatarUrl} onChangeText={setHttpsAvatar} placeholder="URL HTTPS optionnelle" style={[styles.input, styles.stackedInput]} />
        <Text style={[styles.hint, !avatarValid && styles.error]}>Photo stockee en media prive K-ssenger. Les URL HTTPS restent acceptees pour les anciens profils.</Text>

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
  content: { padding: 18, paddingBottom: 40 }, label: { marginTop: 16, marginBottom: 6, color: '#52768a', fontSize: 10, letterSpacing: 1.2, fontWeight: '900' }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cee2ed', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12, color: '#173448' }, stackedInput: { marginTop: 8 }, multiline: { minHeight: 100, textAlignVertical: 'top' }, hint: { color: '#8197a4', fontSize: 10, lineHeight: 14, marginTop: 5 }, error: { color: '#b42318' }, notice: { marginTop: 16, color: '#326e94', fontWeight: '700' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cee2ed', borderRadius: 15 }, avatarPreview: { width: 78, height: 78, borderRadius: 25, backgroundColor: '#2f93cf', borderWidth: 4, borderColor: '#c5ecff', alignItems: 'center', justifyContent: 'center' }, avatarPreviewText: { color: '#fff', fontSize: 30, fontWeight: '900' }, avatarActions: { flex: 1, gap: 8 }, avatarButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#2189c5' }, avatarButtonText: { color: '#fff', fontWeight: '900' }, avatarSecondary: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#eef4f7', borderWidth: 1, borderColor: '#d5e2e9' }, avatarSecondaryText: { color: '#52768a', fontWeight: '900' },
  primary: { minHeight: 48, marginTop: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5', borderRadius: 16 }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: 0.45 },
});
