import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { launchImageLibrarySafe } from '../../lib/pickMedia';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import type { MyProfile } from './useMyProfile';
import { ScreenHeader } from '../../theme/components';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';
import {
  beginSpotifyAuth,
  disconnectLastfm,
  disconnectSpotify,
  getLastfmUsername,
  isSpotifyConnected,
  lastfmConfigured,
  setLastfmUsername,
  spotifyConfigured,
} from '../../lib/musicNowPlaying';

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
      const picked = await launchImageLibrarySafe({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset?.uri) throw new Error('UNSUPPORTED_AVATAR');
      const mimeType = inferAvatarMime(asset);
      if (!mimeType || (asset.fileSize !== undefined && asset.fileSize > AVATAR_MAX_BYTES)) throw new Error('UNSUPPORTED_AVATAR');
      const { mediaId } = await uploadLocalMedia({
        uri: asset.uri,
        mimeType,
        byteSize: asset.fileSize ?? undefined,
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
      <ScreenHeader title="Modifier mon profil" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>PSEUDO</Text>
        <TextInput autoCapitalize="none" autoCorrect={false} value={username} onChangeText={(value) => setUsername(normalizeUsername(value))} maxLength={32} placeholder="@pseudo" style={styles.input} />
        <Text style={styles.hint}>3 à 32 caractères : lettres minuscules, chiffres, point ou underscore.</Text>

        <Text style={styles.label}>NOM AFFICHÉ</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} maxLength={64} placeholder="Nom affiché" style={styles.input} />

        <Text style={styles.label}>STATUT</Text>
        <TextInput value={customStatus} onChangeText={setCustomStatus} maxLength={140} placeholder="Quoi de neuf ?" style={styles.input} />

        <Text style={styles.label}>MUSIQUE EN COURS</Text>
        <MusicSyncCard />
        <TextInput value={nowPlayingTitle} onChangeText={setNowPlayingTitle} maxLength={120} placeholder="Titre du morceau" style={[styles.input, styles.stackedInput]} />
        <TextInput value={nowPlayingArtist} onChangeText={setNowPlayingArtist} maxLength={120} placeholder="Artiste" style={[styles.input, styles.stackedInput]} />
        <Text style={styles.hint}>♫ Affiché à tes contacts selon tes réglages de confidentialité. La synchro automatique écrase ces champs quand une source est connectée.</Text>

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

function MusicSyncCard() {
  const [spotifyOn, setSpotifyOn] = useState(false);
  const [lastfm, setLastfm] = useState('');
  const [savedLastfm, setSavedLastfm] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const [connected, name] = await Promise.all([isSpotifyConnected(), getLastfmUsername()]);
      setSpotifyOn(connected);
      setLastfm(name ?? '');
      setSavedLastfm(name ?? '');
      setReady(true);
    })();
  }, []);

  if (!spotifyConfigured && !lastfmConfigured) return null;

  const saveLastfm = async () => {
    setBusy(true);
    try {
      await setLastfmUsername(lastfm);
      setSavedLastfm(lastfm.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={mstyles.card}>
      <Text style={mstyles.title}>Synchro automatique</Text>
      <Text style={mstyles.lede}>Ta musique se met à jour toute seule pendant que tu écoutes.</Text>

      {spotifyConfigured ? (
        <View style={mstyles.row}>
          <View style={mstyles.rowText}>
            <Text style={mstyles.rowTitle}>Spotify</Text>
            <Text style={mstyles.rowMeta}>{spotifyOn ? 'Connecté' : 'Lecture en direct de ton Spotify'}</Text>
          </View>
          {spotifyOn ? (
            <TouchableOpacity
              disabled={busy}
              onPress={async () => { setBusy(true); await disconnectSpotify(); setSpotifyOn(false); setBusy(false); }}
              style={mstyles.ghostBtn}
            >
              <Text style={mstyles.ghostBtnText}>Déconnecter</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity disabled={busy || !ready} onPress={() => void beginSpotifyAuth()} style={mstyles.spotifyBtn}>
              <Text style={mstyles.spotifyBtnText}>Connecter</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {lastfmConfigured ? (
        <View style={mstyles.lastfmBlock}>
          <Text style={mstyles.rowTitle}>Last.fm</Text>
          <Text style={mstyles.rowMeta}>Couvre Deezer, Apple Music, YouTube Music… via le scrobble.</Text>
          <View style={mstyles.lastfmRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={lastfm}
              onChangeText={setLastfm}
              placeholder="Pseudo Last.fm"
              placeholderTextColor={palette.inkFaint}
              style={mstyles.lastfmInput}
            />
            <TouchableOpacity
              disabled={busy || lastfm.trim() === savedLastfm}
              onPress={() => void saveLastfm()}
              style={[mstyles.ghostBtn, (busy || lastfm.trim() === savedLastfm) && styles.disabled]}
            >
              {busy ? <ActivityIndicator /> : <Text style={mstyles.ghostBtnText}>{savedLastfm && !lastfm.trim() ? 'Retirer' : 'Enregistrer'}</Text>}
            </TouchableOpacity>
          </View>
          {savedLastfm ? (
            <TouchableOpacity onPress={async () => { await disconnectLastfm(); setLastfm(''); setSavedLastfm(''); }}>
              <Text style={mstyles.unlink}>Retirer Last.fm</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const mstyles = StyleSheet.create({
  card: { marginTop: spacing.sm, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { ...typo.heading },
  lede: { ...typo.micro, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  rowTitle: { ...typo.name, fontSize: 14 },
  rowMeta: { ...typo.micro, fontWeight: '500', marginTop: 2 },
  spotifyBtn: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1DB954' },
  spotifyBtnText: { color: palette.white, fontWeight: '900', fontSize: 13 },
  ghostBtn: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline },
  ghostBtnText: { color: palette.inkSoft, fontWeight: '900', fontSize: 13 },
  lastfmBlock: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: palette.hairline, paddingTop: spacing.sm },
  lastfmRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  lastfmInput: { flex: 1, backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: palette.ink },
  unlink: { color: palette.danger, fontWeight: '800', fontSize: 12, marginTop: spacing.xs },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl }, label: { marginTop: spacing.lg, marginBottom: spacing.xs, ...typo.label, textTransform: 'uppercase' }, input: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: palette.ink }, stackedInput: { marginTop: spacing.sm }, multiline: { minHeight: 100, textAlignVertical: 'top' }, hint: { ...typo.micro, fontWeight: '500', lineHeight: 14, marginTop: spacing.xs }, error: { color: palette.danger }, notice: { marginTop: spacing.lg, color: palette.azureDeep, fontWeight: '700' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md }, avatarPreview: { width: 78, height: 78, borderRadius: radius.xl, backgroundColor: palette.azure, borderWidth: 4, borderColor: palette.azureSoft, alignItems: 'center', justifyContent: 'center' }, avatarPreviewText: { color: palette.white, fontSize: 30, fontWeight: '900' }, avatarActions: { flex: 1, gap: spacing.sm }, avatarButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: palette.azure }, avatarButtonText: { color: palette.white, fontWeight: '900' }, avatarSecondary: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: palette.azureSoft, borderWidth: 1, borderColor: palette.hairline }, avatarSecondaryText: { color: palette.inkSoft, fontWeight: '900' },
  primary: { minHeight: 48, marginTop: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure, borderRadius: radius.lg }, primaryText: { color: palette.white, fontWeight: '900' }, disabled: { opacity: 0.45 },
});
