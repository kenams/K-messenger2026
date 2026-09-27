import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { launchImageLibrarySafe } from '../../lib/pickMedia';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import { disconnectRealtimeSocket } from '../../lib/realtime';
import { resetContactAttention } from '../attention/contactAttention';
import type { MyProfile } from './useMyProfile';
import { Equalizer, ScreenHeader } from '../../theme/components';
import { radius, spacing, thirdPartyBrand, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { ACCENT_PRESETS, accentOf, onAccent } from '../../theme/accent';
import {
  AvatarGlyph,
  BODY_TYPES,
  decodeAvatarConfig,
  DEFAULT_AVATAR_CONFIG,
  encodeAvatarConfig,
  HAIR_STYLES,
  OUTFIT_STYLES,
  SKIN_TONES,
  type AvatarConfig,
  type BodyId,
  type HairId,
  type OutfitId,
  type SkinId,
} from '../../theme/avatarPresets';
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

/** Magic-byte signatures for the 3 image formats we accept as an avatar. Checking the
 * real leading bytes (not just a caller-reported label) is what makes this a safe
 * fail-closed default instead of trusting an absent/unverified Content-Type. */
function sniffImageMimeFromBytes(bytes: Uint8Array): SupportedMediaMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

/**
 * The library picker restricts selection to images, but the asset metadata
 * is not always trustworthy: web `blob:` URIs and some Android `content://`
 * providers carry no file extension and no (or an unsupported, e.g. HEIC)
 * `mimeType`. That used to hard-block the whole upload with "format non
 * supporté" even though the picked file was a perfectly normal photo — but a
 * caller-reported label (extension, asset.mimeType, HTTP Content-Type) can
 * also be spoofed, so none of those alone are enough to safely accept a file.
 * This always sniffs the actual leading bytes and enforces AVATAR_MAX_BYTES
 * against the real payload size (asset.fileSize is frequently absent for the
 * same blob:/content:// sources above) — returns null (reject) rather than
 * ever defaulting to "assume it's a JPEG".
 */
async function inferAvatarMime(asset: ImagePicker.ImagePickerAsset): Promise<SupportedMediaMime | null> {
  try {
    const response = await fetch(asset.uri);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > AVATAR_MAX_BYTES) return null;
    return sniffImageMimeFromBytes(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

export function ProfileEditScreen({ profile, onSaved, onBack }: { profile: MyProfile; onSaved: () => Promise<void>; onBack: () => void }) {
  const { styles, colors, scheme } = useThemedStyles();
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [customStatus, setCustomStatus] = useState(profile.custom_status ?? '');
  const [nowPlayingTitle, setNowPlayingTitle] = useState(profile.now_playing_title ?? '');
  const [nowPlayingArtist, setNowPlayingArtist] = useState(profile.now_playing_artist ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [accentColor, setAccentColor] = useState(accentOf(profile.accent_color));
  const [avatarUrl, setAvatarUrl] = useState(isHttpsAvatarUrl(profile.avatar_url) ? profile.avatar_url : '');
  const [avatarMediaId, setAvatarMediaId] = useState(profile.avatar_media_id);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(isHttpsAvatarUrl(profile.avatar_url) ? profile.avatar_url : null);
  const [selectedPreset, setSelectedPreset] = useState<AvatarConfig | null>(decodeAvatarConfig(profile.avatar_url));
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [draftAvatar, setDraftAvatar] = useState<AvatarConfig>(() => decodeAvatarConfig(profile.avatar_url) ?? DEFAULT_AVATAR_CONFIG);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [signOutBusy, setSignOutBusy] = useState(false);

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
    setSelectedPreset(null);
  };

  const clearAvatar = () => {
    setAvatarUrl('');
    setAvatarMediaId(null);
    setAvatarPreviewUri(null);
    setSelectedPreset(null);
  };

  const openAvatarComposer = () => {
    setDraftAvatar(selectedPreset ?? DEFAULT_AVATAR_CONFIG);
    setAvatarPickerOpen((open) => !open);
  };

  const updateDraft = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    setDraftAvatar((current) => ({ ...current, [key]: value }));
  };

  const confirmAvatarComposer = () => {
    setSelectedPreset(draftAvatar);
    setAvatarUrl('');
    setAvatarMediaId(null);
    setAvatarPreviewUri(null);
    setAvatarPickerOpen(false);
    setNotice('');
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
      if (asset.fileSize !== undefined && asset.fileSize > AVATAR_MAX_BYTES) throw new Error('UNSUPPORTED_AVATAR');
      const mimeType = await inferAvatarMime(asset);
      if (!mimeType) throw new Error('UNSUPPORTED_AVATAR');
      const { mediaId } = await uploadLocalMedia({
        uri: asset.uri,
        mimeType,
        byteSize: asset.fileSize ?? undefined,
        purpose: 'avatar',
      });
      setAvatarUrl('');
      setAvatarPreviewUri(asset.uri);
      setAvatarMediaId(mediaId);
      setSelectedPreset(null);
      setAvatarPickerOpen(false);
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
          accent_color: accentColor,
          avatar_url: selectedPreset ? encodeAvatarConfig(selectedPreset) : avatarMediaId ? `media:${avatarMediaId}` : avatar,
          avatar_media_id: avatarMediaId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      if (error) {
        setNotice('Impossible d’enregistrer. Le pseudo est peut-être déjà utilisé.');
        return;
      }
      await onSaved();
      onBack();
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (signOutBusy || busy || avatarBusy) return;
    setSignOutBusy(true);
    try {
      // Local E2EE identity keys stay on this device (a real sign-out is not
      // an account deletion): only the session and this run's live in-memory
      // badge/sort state go away, so re-logging in still decrypts history.
      resetContactAttention();
      disconnectRealtimeSocket();
      await getBackend().auth.signOut();
    } finally {
      setSignOutBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ScreenHeader title="Modifier mon profil" onBack={onBack} />
      {(nowPlayingTitle.trim() || nowPlayingArtist.trim()) ? (
        <View style={styles.selfNowPlayingRow} accessibilityLabel={`En cours d'écoute : ${[nowPlayingTitle, nowPlayingArtist].filter(Boolean).join(' — ')}`}>
          <Text style={styles.selfNowPlayingName} numberOfLines={1}>{displayName.trim() || username}</Text>
          <Equalizer size={12} />
          <Text style={styles.selfNowPlayingText} numberOfLines={1}>
            {[nowPlayingTitle.trim(), nowPlayingArtist.trim()].filter(Boolean).join(' — ')}
          </Text>
        </View>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>PSEUDO</Text>
        <TextInput autoCapitalize="none" autoCorrect={false} value={username} onChangeText={(value) => setUsername(normalizeUsername(value))} maxLength={32} placeholder="@pseudo" style={styles.input} />
        <Text style={styles.hint}>3 à 32 caractères : lettres minuscules, chiffres, point ou underscore.</Text>

        <Text style={styles.label}>NOM AFFICHÉ</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} maxLength={64} placeholder="Nom affiché" style={styles.input} />

        <Text style={styles.label}>STATUT</Text>
        <TextInput value={customStatus} onChangeText={setCustomStatus} maxLength={140} placeholder="Quoi de neuf ?" style={styles.input} />

        <Text style={styles.label}>MUSIQUE EN COURS</Text>
        <MusicSyncCard userId={profile.id} initialLastfm={profile.lastfm_username} />
        <TextInput value={nowPlayingTitle} onChangeText={setNowPlayingTitle} maxLength={120} placeholder="Titre du morceau" style={[styles.input, styles.stackedInput]} />
        <TextInput value={nowPlayingArtist} onChangeText={setNowPlayingArtist} maxLength={120} placeholder="Artiste" style={[styles.input, styles.stackedInput]} />
        <Text style={styles.hint}>♫ Affiché à tes contacts selon tes réglages de confidentialité. La synchro automatique écrase ces champs quand une source est connectée.</Text>

        <Text style={styles.label}>COULEUR D'IDENTITÉ</Text>
        <View style={styles.accentRow}>
          {ACCENT_PRESETS.map((preset) => {
            const selected = accentColor.toLowerCase() === preset.toLowerCase();
            return (
              <TouchableOpacity
                key={preset}
                accessibilityRole="button"
                accessibilityLabel={`Couleur ${preset}`}
                onPress={() => setAccentColor(preset)}
                style={[styles.accentDot, { backgroundColor: preset }, selected && styles.accentDotSelected]}
              >
                {selected ? <Text style={[styles.accentCheck, { color: onAccent(preset) }]}>✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>Ta couleur te suit partout : ton profil, ton nom dans les listes, l'en-tête de tes conversations.</Text>

        <Text style={styles.label}>BIO</Text>
        <TextInput value={bio} onChangeText={setBio} maxLength={500} multiline placeholder="Quelques mots sur toi" style={[styles.input, styles.multiline]} />

        <Text style={styles.label}>AVATAR</Text>
        <View style={styles.avatarRow}>
          {selectedPreset
            ? <View style={styles.avatarPresetPreviewWrap}><AvatarGlyph config={selectedPreset} size={78} /></View>
            : avatarPreviewUri
            ? <Image source={{ uri: avatarPreviewUri }} style={styles.avatarPreview} />
            : <View style={styles.avatarPreview}><Text style={styles.avatarPreviewText}>{displayName[0]?.toUpperCase() ?? 'K'}</Text></View>}
          <View style={styles.avatarActions}>
            <TouchableOpacity disabled={avatarBusy || busy} onPress={() => void pickAvatar()} style={[styles.avatarButton, (avatarBusy || busy) && styles.disabled]}>
              {avatarBusy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.avatarButtonText}>Choisir une photo</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={avatarBusy || busy} onPress={openAvatarComposer} style={styles.avatarSecondary}>
              <Text style={styles.avatarSecondaryText}>{avatarPickerOpen ? 'Fermer le créateur' : 'Créer mon avatar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={avatarBusy || busy} onPress={clearAvatar} style={styles.avatarSecondary}>
              <Text style={styles.avatarSecondaryText}>Retirer</Text>
            </TouchableOpacity>
          </View>
        </View>
        {avatarPickerOpen ? (
          <AvatarComposer draft={draftAvatar} onChange={updateDraft} onConfirm={confirmAvatarComposer} />
        ) : null}
        <TextInput autoCapitalize="none" autoCorrect={false} value={avatarUrl} onChangeText={setHttpsAvatar} placeholder="URL HTTPS optionnelle" style={[styles.input, styles.stackedInput]} />
        <Text style={[styles.hint, !avatarValid && styles.error]}>Photo stockee en media prive K-ssenger, avatar composé, ou URL HTTPS pour les anciens profils.</Text>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        <TouchableOpacity disabled={!canSave} onPress={() => void save()} accessibilityRole="button" accessibilityLabel="Enregistrer" style={[styles.primary, !canSave && styles.disabled]}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Enregistrer</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          disabled={signOutBusy}
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
          style={[styles.signOut, signOutBusy && styles.disabled]}
        >
          {signOutBusy ? <ActivityIndicator color={colors.inkSoft} /> : <Text style={styles.signOutText}>Se déconnecter</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useAvatarComposerStyles() {
  const { colors, type: typo } = useTheme();
  return useMemo(() => StyleSheet.create({
    card: { marginTop: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
    heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    previewWrap: { width: 84, height: 84, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 4, borderColor: colors.azureSoft },
    headingText: { flex: 1 },
    title: { ...typo.heading },
    lede: { ...typo.micro, fontWeight: '500', marginTop: 2 },
    section: { gap: spacing.xs },
    sectionLabel: { ...typo.label, textTransform: 'uppercase' },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    swatchSelected: { borderColor: colors.azure },
    skinSwatch: { borderRadius: radius.pill },
    skinSwatchInner: { width: 32, height: 32, borderRadius: radius.pill },
    chip: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.hairline },
    chipSelected: { backgroundColor: colors.azureSoft, borderColor: colors.azure },
    chipText: { ...typo.micro, fontWeight: '800', color: colors.inkSoft },
    chipTextSelected: { color: colors.azureDeep },
    confirmBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.azure },
    confirmBtnText: { color: colors.white, fontWeight: '900' },
  }), [colors, typo]);
}

/**
 * A real Bitmoji-style avatar builder: skin, hair, outfit and build are each
 * chosen independently with a live composed preview, instead of picking one
 * fixed image from a gallery. `draft` is only committed to the profile when
 * "Valider mon avatar" is pressed.
 */
function AvatarComposer({
  draft,
  onChange,
  onConfirm,
}: {
  draft: AvatarConfig;
  onChange: <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => void;
  onConfirm: () => void;
}) {
  const styles = useAvatarComposerStyles();
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.previewWrap}>
          <AvatarGlyph config={draft} size={84} />
        </View>
        <View style={styles.headingText}>
          <Text style={styles.title}>Créer mon avatar</Text>
          <Text style={styles.lede}>Compose ton personnage : peau, cheveux, tenue, silhouette.</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Peau</Text>
        <View style={styles.swatchRow}>
          {SKIN_TONES.map((tone) => (
            <TouchableOpacity
              key={tone.id}
              accessibilityRole="button"
              accessibilityLabel={`Peau ${tone.label}`}
              onPress={() => onChange('skin', tone.id as SkinId)}
              style={[styles.swatch, styles.skinSwatch, draft.skin === tone.id && styles.swatchSelected]}
            >
              <View style={[styles.skinSwatchInner, { backgroundColor: tone.color }]} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Cheveux</Text>
        <View style={styles.swatchRow}>
          {HAIR_STYLES.map((h) => (
            <TouchableOpacity
              key={h.id}
              accessibilityRole="button"
              accessibilityLabel={`Cheveux ${h.label}`}
              onPress={() => onChange('hair', h.id as HairId)}
              style={[styles.chip, draft.hair === h.id && styles.chipSelected]}
            >
              <Text style={[styles.chipText, draft.hair === h.id && styles.chipTextSelected]}>{h.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Tenue</Text>
        <View style={styles.swatchRow}>
          {OUTFIT_STYLES.map((o) => (
            <TouchableOpacity
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={`Tenue ${o.label}`}
              onPress={() => onChange('outfit', o.id as OutfitId)}
              style={[styles.chip, draft.outfit === o.id && styles.chipSelected]}
            >
              <Text style={[styles.chipText, draft.outfit === o.id && styles.chipTextSelected]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Silhouette</Text>
        <View style={styles.swatchRow}>
          {BODY_TYPES.map((b) => (
            <TouchableOpacity
              key={b.id}
              accessibilityRole="button"
              accessibilityLabel={`Silhouette ${b.label}`}
              onPress={() => onChange('body', b.id as BodyId)}
              style={[styles.chip, draft.body === b.id && styles.chipSelected]}
            >
              <Text style={[styles.chipText, draft.body === b.id && styles.chipTextSelected]}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Valider mon avatar" onPress={onConfirm} style={styles.confirmBtn}>
        <Text style={styles.confirmBtnText}>Valider mon avatar</Text>
      </TouchableOpacity>
    </View>
  );
}

function useMusicSyncStyles() {
  const { colors, type: typo } = useTheme();
  return useMemo(() => StyleSheet.create({
    card: { marginTop: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
    title: { ...typo.heading },
    lede: { ...typo.micro, fontWeight: '500' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    rowText: { flex: 1 },
    rowTitle: { ...typo.name, fontSize: 14 },
    rowMeta: { ...typo.micro, fontWeight: '500', marginTop: 2 },
    rowNote: { ...typo.micro, fontWeight: '500', marginTop: 4, color: colors.inkFaint, lineHeight: 14 },
    spotifyBtn: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: thirdPartyBrand.spotifyGreen },
    spotifyBtnText: { color: colors.white, fontWeight: '900', fontSize: 13 },
    ghostBtn: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.hairline },
    ghostBtnText: { color: colors.inkSoft, fontWeight: '900', fontSize: 13 },
    lastfmBlock: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
    lastfmRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    lastfmInput: { flex: 1, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink },
    unlink: { color: colors.danger, fontWeight: '800', fontSize: 12, marginTop: spacing.xs },
    lastfmHelp: { color: colors.azureDeep, fontWeight: '700', fontSize: 12 },
  }), [colors, typo]);
}

function MusicSyncCard({ userId, initialLastfm }: { userId: string; initialLastfm: string | null }) {
  const { styles, colors } = useThemedStyles();
  const mstyles = useMusicSyncStyles();
  const [spotifyOn, setSpotifyOn] = useState(false);
  const [lastfm, setLastfm] = useState(initialLastfm ?? '');
  const [savedLastfm, setSavedLastfm] = useState(initialLastfm ?? '');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      setSpotifyOn(await isSpotifyConnected());
      setReady(true);
    })();
  }, []);

  if (!spotifyConfigured && !lastfmConfigured) return null;

  const saveLastfm = async () => {
    setBusy(true);
    try {
      await setLastfmUsername(userId, lastfm);
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
            <Text style={mstyles.rowNote}>Nécessite un compte Spotify Premium (l'API de Spotify refuse la lecture en direct aux comptes gratuits).</Text>
          </View>
          {spotifyOn ? (
            <TouchableOpacity
              disabled={busy}
              onPress={async () => { setBusy(true); await disconnectSpotify(); setSpotifyOn(false); setBusy(false); }}
              accessibilityRole="button"
              accessibilityLabel="Déconnecter Spotify"
              style={mstyles.ghostBtn}
            >
              <Text style={mstyles.ghostBtnText}>Déconnecter</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity disabled={busy || !ready} onPress={() => void beginSpotifyAuth()} accessibilityRole="button" accessibilityLabel="Connecter Spotify" style={mstyles.spotifyBtn}>
              <Text style={mstyles.spotifyBtnText}>Connecter</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {lastfmConfigured ? (
        <View style={mstyles.lastfmBlock}>
          <Text style={mstyles.rowTitle}>Last.fm</Text>
          <Text style={mstyles.rowMeta}>Couvre Deezer, Apple Music, YouTube Music… via le scrobble.</Text>
          {!savedLastfm ? (
            <TouchableOpacity
              onPress={() => void Linking.openURL('https://www.last.fm/join')}
              accessibilityRole="button"
              accessibilityLabel="Créer un compte Last.fm"
            >
              <Text style={mstyles.lastfmHelp}>Pas de compte Last.fm ? Le créer en 30 secondes →</Text>
            </TouchableOpacity>
          ) : null}
          <View style={mstyles.lastfmRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              value={lastfm}
              onChangeText={setLastfm}
              placeholder="Pseudo Last.fm"
              placeholderTextColor={colors.inkFaint}
              style={mstyles.lastfmInput}
            />
            <TouchableOpacity
              disabled={busy || lastfm.trim() === savedLastfm}
              onPress={() => void saveLastfm()}
              accessibilityRole="button"
              accessibilityLabel={savedLastfm && !lastfm.trim() ? 'Retirer le pseudo Last.fm' : 'Confirmer le pseudo Last.fm'}
              style={[mstyles.ghostBtn, (busy || lastfm.trim() === savedLastfm) && styles.disabled]}
            >
              {busy ? <ActivityIndicator /> : <Text style={mstyles.ghostBtnText}>{savedLastfm && !lastfm.trim() ? 'Retirer' : 'Enregistrer'}</Text>}
            </TouchableOpacity>
          </View>
          {savedLastfm ? (
            <TouchableOpacity onPress={async () => { await disconnectLastfm(userId); setLastfm(''); setSavedLastfm(''); }} accessibilityRole="button" accessibilityLabel="Retirer Last.fm">
              <Text style={mstyles.unlink}>Retirer Last.fm</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl }, label: { marginTop: spacing.lg, marginBottom: spacing.xs, ...typo.label, textTransform: 'uppercase' }, input: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: palette.ink }, stackedInput: { marginTop: spacing.sm }, multiline: { minHeight: 100, textAlignVertical: 'top' }, hint: { ...typo.micro, fontWeight: '500', lineHeight: 14, marginTop: spacing.xs }, error: { color: palette.danger }, notice: { marginTop: spacing.lg, color: palette.azureDeep, fontWeight: '700' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md }, avatarPreview: { width: 78, height: 78, borderRadius: radius.xl, backgroundColor: palette.azure, borderWidth: 4, borderColor: palette.azureSoft, alignItems: 'center', justifyContent: 'center' }, avatarPreviewText: { color: palette.white, fontSize: 30, fontWeight: '900' }, avatarPresetPreviewWrap: { width: 78, height: 78, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 4, borderColor: palette.azureSoft }, avatarActions: { flex: 1, gap: spacing.sm }, avatarButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: palette.azure }, avatarButtonText: { color: palette.white, fontWeight: '900' }, avatarSecondary: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: palette.azureSoft, borderWidth: 1, borderColor: palette.hairline }, avatarSecondaryText: { color: palette.inkSoft, fontWeight: '900' },
  avatarPresetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md },
  avatarPresetCell: { width: 60, height: 60, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', padding: 2 },
  avatarPresetCellSelected: { borderColor: palette.azure },
  accentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  accentDot: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  accentDotSelected: { borderColor: palette.ink },
  accentCheck: { fontWeight: '900', fontSize: 16 },
  primary: { minHeight: 48, marginTop: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure, borderRadius: radius.lg }, primaryText: { color: palette.white, fontWeight: '900' }, disabled: { opacity: 0.45 },
  signOut: { minHeight: 44, marginTop: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.surface }, signOutText: { color: palette.inkSoft, fontWeight: '800' },
  selfNowPlayingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  selfNowPlayingName: { ...typo.name, fontSize: 13, flexShrink: 0 },
  selfNowPlayingText: { ...typo.micro, fontWeight: '600', color: palette.inkSoft, flexShrink: 1 },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
