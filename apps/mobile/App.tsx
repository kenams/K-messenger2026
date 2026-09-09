import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FeedScreen } from './src/features/feed/FeedScreen';
import { MomentsScreen } from './src/features/moments/MomentsScreen';
import { KMapScreen } from './src/features/map/KMapScreen';
import { MsnContactsScreen, type Contact } from './src/features/contacts/MsnContactsScreen';
import { ChatsHubScreen } from './src/features/chats/ChatsHubScreen';
import { DirectConversationScreen } from './src/features/chats/DirectConversationScreen';
import { GroupsScreen } from './src/features/groups/GroupsScreen';
import { AccountDataScreen } from './src/features/profile/AccountDataScreen';
import { PrivacySettingsScreen } from './src/features/profile/PrivacySettingsScreen';
import { ProfileEditScreen } from './src/features/profile/ProfileEditScreen';
import { WebLinkScreen } from './src/features/devicelink/WebLinkScreen';
import { LinkedDevicesScreen } from './src/features/devicelink/LinkedDevicesScreen';
import { WebRelayConversationScreen } from './src/features/devicelink/WebRelayConversationScreen';
import { useDeviceLinkRelay, useWebLink } from './src/lib/deviceLinkClient';
import type { MyProfile } from './src/features/profile/useMyProfile';
import { unregisterPushForSignOut } from './src/features/push/usePushRegistration';
import { getBackend } from './src/lib/backend';
import { getMediaDownload } from './src/lib/media';
import { disconnectRealtimeSocket } from './src/lib/realtime';
import { LinearGradient } from 'expo-linear-gradient';
import { brandGradient, elevation, layout, palette, radius, spacing, type as typo } from './src/theme/tokens';
import { Equalizer, NowPlayingSheet, PresenceBadge, ScreenHeader, useAndroidBack } from './src/theme/components';

type TabName = 'contacts' | 'chats' | 'feed' | 'map' | 'moments' | 'me';

type AppProps = {
  profile: MyProfile;
  onProfileChanged: () => Promise<void>;
};

type AgeProfileRow = {
  birth_date?: string;
};

function ageFromBirthDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const monthDelta = now.getUTCMonth() - (month - 1);
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < day)) age -= 1;
  return age;
}

function isHttpsAvatarUrl(value: string | null | undefined): value is string {
  return !!value && /^https:\/\//i.test(value);
}

/** Centered app column so web never sprawls edge to edge. */
function WebShell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.shell}>{children}</View>
    </SafeAreaView>
  );
}

export default function App({ profile, onProfileChanged }: AppProps) {
  const [tab, setTab] = useState<TabName>('contacts');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [accountData, setAccountData] = useState(false);
  const [privacySettings, setPrivacySettings] = useState(false);
  const [groupsScreen, setGroupsScreen] = useState(false);
  const [linkedDevices, setLinkedDevices] = useState(false);
  const [webLinkScreen, setWebLinkScreen] = useState(false);
  const webLink = useWebLink();
  useDeviceLinkRelay(profile.id);
  const [userAge, setUserAge] = useState<number | null>(null);
  const [ageLoading, setAgeLoading] = useState(true);
  const [ageSaving, setAgeSaving] = useState(false);
  const [birthDateInput, setBirthDateInput] = useState('');
  const [ageError, setAgeError] = useState('');
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  // One place to dismiss whatever secondary screen sits above the tab shell.
  const overlayOpen =
    !!selected || webLinkScreen || linkedDevices || editingProfile || accountData || privacySettings || groupsScreen;

  const closeOverlays = useCallback(() => {
    setSelected(null);
    setWebLinkScreen(false);
    setLinkedDevices(false);
    setEditingProfile(false);
    setAccountData(false);
    setPrivacySettings(false);
    setGroupsScreen(false);
  }, []);

  // Android hardware back closes the current secondary screen instead of the app.
  useAndroidBack(overlayOpen ? closeOverlays : undefined);

  // On web, the browser Back button mirrors that: opening a secondary screen
  // pushes one history entry, and popping it returns to the buddy list.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !overlayOpen) return;
    window.history.pushState({ kssOverlay: true }, '');
    const onPop = () => closeOverlays();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [overlayOpen, closeOverlays]);

  const saveNowPlaying = async (title: string, artist: string) => {
    try {
      await getBackend()
        .from('profiles')
        .update({
          now_playing_title: title || null,
          now_playing_artist: artist || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      await onProfileChanged();
    } catch {
      // Non-blocking: the buddy list poll will pick up the next successful write.
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await getBackend()
          .from('user_age_profile')
          .select('birth_date')
          .eq('user_id', profile.id)
          .limit(1);
        if (error) throw error;
        const rows = ((data ?? []) as unknown) as AgeProfileRow[];
        const birthDate = rows[0]?.birth_date;
        const age = birthDate ? ageFromBirthDate(birthDate) : null;
        if (!active) return;
        if (birthDate) setBirthDateInput(birthDate);
        if (age !== null && age >= 13 && age <= 120) setUserAge(age);
      } catch {
        if (active) setAgeError('Impossible de vérifier ton profil d’âge pour le moment.');
      } finally {
        if (active) setAgeLoading(false);
      }
    })();
    return () => { active = false; };
  }, [profile.id]);

  const confirmAge = async () => {
    if (ageSaving) return;
    const parsedAge = ageFromBirthDate(birthDateInput.trim());
    if (parsedAge === null || parsedAge < 13 || parsedAge > 120) {
      setAgeError('Entre une date valide au format AAAA-MM-JJ. K-ssenger est réservé aux 13 ans et plus.');
      return;
    }

    setAgeSaving(true);
    setAgeError('');
    try {
      const birthDate = birthDateInput.trim();
      const existing = await getBackend()
        .from('user_age_profile')
        .select('user_id')
        .eq('user_id', profile.id)
        .limit(1);
      if (existing.error) throw existing.error;
      const rows = ((existing.data ?? []) as unknown) as Array<{ user_id?: string }>;
      const response = rows.length
        ? await getBackend()
            .from('user_age_profile')
            .update({ birth_date: birthDate, age_assurance_level: 'declared', updated_at: new Date().toISOString() })
            .eq('user_id', profile.id)
        : await getBackend()
            .from('user_age_profile')
            .insert({ user_id: profile.id, birth_date: birthDate, age_assurance_level: 'declared' });
      if (response.error) throw response.error;
      setUserAge(parsedAge);
    } catch {
      setAgeError('Impossible d’enregistrer la date de naissance. Aucun accès au K-Feed public n’est accordé sans ce contrôle.');
    } finally {
      setAgeSaving(false);
    }
  };

  if (ageLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.ageGate}><ActivityIndicator size="large" color={palette.azure} /><Text style={styles.legal}>Vérification du profil de sécurité…</Text></View>
      </SafeAreaView>
    );
  }

  if (userAge === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.ageWash} pointerEvents="none" />
        <View style={styles.ageGate}>
          <View style={styles.ageCard}>
            <Avatar profile={profile} size="large" />
            <Text style={styles.brand}>K · SSENGER</Text>
            <Text style={styles.ageTitle}>Bienvenue {profile.display_name}</Text>
            <Text style={styles.ageCopy}>Ta date de naissance sert au filtrage serveur du K-Feed. Elle reste protégée par les règles RLS de ton compte.</Text>
            <TextInput
              value={birthDateInput}
              onChangeText={setBirthDateInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={palette.inkFaint}
              maxLength={10}
              style={styles.ageInput}
              onSubmitEditing={() => void confirmAge()}
            />
            {!!ageError && <Text style={styles.error}>{ageError}</Text>}
            <TouchableOpacity disabled={ageSaving} activeOpacity={0.9} style={[styles.primaryShell, ageSaving && styles.disabled]} onPress={() => void confirmAge()}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary} pointerEvents="none">
                {ageSaving ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryText}>Entrer dans K-ssenger</Text>}
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.legal}>Âge déclaré · l’accès au contenu public reste fermé tant que ce profil n’est pas enregistré côté Neon.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (selected) {
    const relay = Platform.OS === 'web' && webLink.status === 'linked';
    return (
      <WebShell>
        {relay
          ? <WebRelayConversationScreen contact={selected} webLink={webLink} currentUserId={profile.id} onBack={() => setSelected(null)} />
          : <DirectConversationScreen contact={selected} onBack={() => setSelected(null)} onLinkPhone={Platform.OS === 'web' ? () => { setSelected(null); setWebLinkScreen(true); } : undefined} />}
      </WebShell>
    );
  }
  if (webLinkScreen) return <WebShell><WebLinkScreen webLink={webLink} onBack={() => setWebLinkScreen(false)} /></WebShell>;
  if (linkedDevices) return <WebShell><LinkedDevicesScreen userId={profile.id} onBack={() => setLinkedDevices(false)} /></WebShell>;
  if (editingProfile) return <WebShell><ProfileEditScreen profile={profile} onSaved={onProfileChanged} onBack={() => setEditingProfile(false)} /></WebShell>;
  if (accountData) return <WebShell><AccountDataScreen profile={profile} onBack={() => setAccountData(false)} /></WebShell>;
  if (privacySettings) return <WebShell><PrivacySettingsScreen userId={profile.id} onBack={() => setPrivacySettings(false)} /></WebShell>;
  if (groupsScreen) {
    return (
      <WebShell>
        <ScreenHeader title="Groupes" subtitle="Salons chiffrés" onBack={() => setGroupsScreen(false)} />
        <GroupsScreen />
      </WebShell>
    );
  }

  const immersive = tab === 'feed';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={[styles.shell, immersive && styles.shellImmersive]}>
        {tab !== 'feed' && tab !== 'moments' && tab !== 'map' && <ProfileHeader profile={profile} onEdit={() => setEditingProfile(true)} onNowPlaying={() => setNowPlayingOpen(true)} />}
        {tab === 'contacts' && <MsnContactsScreen onOpen={setSelected} />}
        {tab === 'chats' && <ChatsHubScreen />}
        {tab === 'feed' && <FeedScreen userAge={userAge} />}
        {tab === 'map' && <KMapScreen />}
        {tab === 'moments' && <MomentsScreen />}
        {tab === 'me' && <MeScreen profile={profile} userAge={userAge} onEdit={() => setEditingProfile(true)} onAccountData={() => setAccountData(true)} onPrivacy={() => setPrivacySettings(true)} onGroups={() => setGroupsScreen(true)} onNowPlaying={() => setNowPlayingOpen(true)} onLink={() => (Platform.OS === 'web' ? setWebLinkScreen(true) : setLinkedDevices(true))} webLinked={webLink.status === 'linked'} />}
        <View style={styles.tabs}>
          <Tab active={tab === 'contacts'} icon="👥" label="Contacts" onPress={() => setTab('contacts')} />
          <Tab active={tab === 'chats'} icon="💬" label="Chats" onPress={() => setTab('chats')} />
          <Tab active={tab === 'feed'} icon="▶️" label="K-Feed" onPress={() => setTab('feed')} />
          <Tab active={tab === 'map'} icon="📍" label="K-Map" onPress={() => setTab('map')} />
          <Tab active={tab === 'moments'} icon="✨" label="Moments" onPress={() => setTab('moments')} />
          <Tab active={tab === 'me'} icon="🙂" label="Moi" onPress={() => setTab('me')} />
        </View>
      </View>
      <NowPlayingSheet
        visible={nowPlayingOpen}
        initialTitle={profile.now_playing_title ?? ''}
        initialArtist={profile.now_playing_artist ?? ''}
        onClose={() => setNowPlayingOpen(false)}
        onSubmit={saveNowPlaying}
      />
    </SafeAreaView>
  );
}

function Avatar({ profile, size = 'small' }: { profile: MyProfile; size?: 'small' | 'large' }) {
  const style = size === 'large' ? styles.profileAvatar : styles.avatar;
  const textStyle = size === 'large' ? styles.profileAvatarText : styles.avatarText;
  const [signedAvatarUrl, setSignedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!profile.avatar_media_id) {
      setSignedAvatarUrl(null);
      return () => { active = false; };
    }
    void getMediaDownload(profile.avatar_media_id)
      .then((download) => { if (active) setSignedAvatarUrl(download.url); })
      .catch(() => { if (active) setSignedAvatarUrl(null); });
    return () => { active = false; };
  }, [profile.avatar_media_id]);

  const avatarUri = signedAvatarUrl ?? (isHttpsAvatarUrl(profile.avatar_url) ? profile.avatar_url : null);
  if (avatarUri) return <Image source={{ uri: avatarUri }} style={style} />;
  return <View style={style}><Text style={textStyle}>{profile.display_name[0]?.toUpperCase() ?? 'K'}</Text></View>;
}

function ProfileHeader({ profile, onEdit, onNowPlaying }: { profile: MyProfile; onEdit: () => void; onNowPlaying: () => void }) {
  const track = profile.now_playing_title
    ? `${profile.now_playing_artist ? `${profile.now_playing_artist} — ` : ''}${profile.now_playing_title}`
    : null;
  return (
    <View style={styles.hero}>
      <View style={styles.avatarRing}><Avatar profile={profile} /><View style={styles.heroBadge}><PresenceBadge presence={profile.presence} size={14} /></View></View>
      <View style={styles.flex}>
        <Text style={styles.brand}>K-SSENGER</Text>
        <Text style={styles.name} numberOfLines={1}>{profile.display_name}</Text>
        <Text style={styles.status} numberOfLines={1}>{profile.custom_status || `@${profile.username}`}</Text>
        <TouchableOpacity style={styles.nowPlayingPill} onPress={onNowPlaying} accessibilityRole="button" accessibilityLabel="Modifier la musique que j'écoute">
          {track ? <Equalizer size={12} /> : <Text style={styles.nowPlayingIcon}>♪</Text>}
          <Text style={styles.nowPlayingText} numberOfLines={1}>{track ?? 'Partager ma musique'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onEdit} accessibilityLabel="Modifier mon profil" style={styles.headerGear}><Text style={styles.headerAction}>⚙︎</Text></TouchableOpacity>
    </View>
  );
}

function MeScreen({ profile, userAge, onEdit, onAccountData, onPrivacy, onGroups, onNowPlaying, onLink, webLinked }: { profile: MyProfile; userAge: number; onEdit: () => void; onAccountData: () => void; onPrivacy: () => void; onGroups: () => void; onNowPlaying: () => void; onLink: () => void; webLinked: boolean }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      await unregisterPushForSignOut(profile.id);
      const { error } = await getBackend().auth.signOut();
      if (error) throw error;
      disconnectRealtimeSocket();
    } catch {
      setSignOutError('Déconnexion sécurisée impossible pour le moment. Réessaie avec une connexion réseau afin de couper aussi les notifications de ce compte.');
      setSigningOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.profilePage}>
      <Avatar profile={profile} size="large" />
      <Text style={styles.profileName}>{profile.display_name}</Text><Text style={styles.profileHandle}>@{profile.username}</Text>
      <Text style={styles.profilePresence}>{profile.custom_status || 'Disponible'}</Text>
      <TouchableOpacity style={styles.meNowPlaying} onPress={onNowPlaying} accessibilityRole="button">
        {profile.now_playing_title ? <Equalizer size={14} /> : <Text style={styles.nowPlayingIcon}>♪</Text>}
        <Text style={styles.meNowPlayingText} numberOfLines={1}>
          {profile.now_playing_title
            ? `${profile.now_playing_artist ? `${profile.now_playing_artist} — ` : ''}${profile.now_playing_title}`
            : 'Partager la musique que j’écoute'}
        </Text>
      </TouchableOpacity>
      {!!profile.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}
      <View style={styles.profileGrid}><ProfileButton icon="✏️" label="Profil" onPress={onEdit}/><ProfileButton icon="📦" label="Données" onPress={onAccountData}/><ProfileButton icon="👥" label="Groupes" onPress={onGroups}/><ProfileButton icon="🔒" label="Vie privée" onPress={onPrivacy}/></View>
      <View style={[styles.profileGrid, { marginTop: spacing.sm }]}><ProfileButton icon={Platform.OS === 'web' ? (webLinked ? '🔗' : '📱') : '🖥️'} label={Platform.OS === 'web' ? (webLinked ? 'Téléphone lié' : 'Lier mon tel') : 'Appareils liés'} onPress={onLink}/></View>
      <TouchableOpacity disabled={signingOut} style={[styles.signOutButton, signingOut && styles.disabled]} onPress={() => void signOut()} accessibilityRole="button" accessibilityLabel="Se déconnecter de K-ssenger">
        {signingOut ? <ActivityIndicator /> : <Text style={styles.signOutText}>Se déconnecter</Text>}
      </TouchableOpacity>
      {!!signOutError && <Text style={styles.error}>{signOutError}</Text>}
      <Text style={styles.profileFoot}>Âge déclaré : {userAge} ans · contrôle de confidentialité actif</Text>
    </ScrollView>
  );
}

function ProfileButton({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
  return <TouchableOpacity style={styles.profileButton} onPress={onPress}><Text style={styles.profileButtonIcon}>{icon}</Text><Text style={styles.profileButtonLabel}>{label}</Text></TouchableOpacity>;
}

function Tab({ active, icon, label, onPress }: { active: boolean; icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <View style={[styles.tabPill, active && styles.tabPillActive]}>
        <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</Text>
      </View>
      <Text style={[styles.tabLabel, active && styles.tabActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const SHELL_MAX = 720;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surfaceSunken, alignItems: 'center' },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: SHELL_MAX,
    backgroundColor: palette.sky,
    ...(Platform.OS === 'web' ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: palette.hairline } : null),
  },
  shellImmersive: { maxWidth: SHELL_MAX, backgroundColor: '#07131c' },
  flex: { flex: 1 },

  ageWash: { position: 'absolute', top: 0, left: 0, right: 0, height: 320, backgroundColor: palette.skyTop },
  ageGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  ageCard: {
    width: '100%', maxWidth: layout.maxContent, alignItems: 'center',
    backgroundColor: palette.surface, borderRadius: radius.xxl, borderWidth: 1, borderColor: palette.hairline,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, ...elevation.floating,
  },
  brand: { marginTop: spacing.md, ...typo.brand },
  ageTitle: { marginTop: spacing.sm, ...typo.display, fontSize: 26, lineHeight: 30, textAlign: 'center' },
  ageCopy: { marginTop: spacing.sm, ...typo.body, color: palette.inkSoft, maxWidth: 400, textAlign: 'center' },
  ageInput: {
    width: 200, marginTop: spacing.lg, backgroundColor: palette.surfaceSunken, borderWidth: 1.5, borderColor: palette.hairline,
    borderRadius: radius.md, paddingVertical: spacing.md, textAlign: 'center', fontSize: 17, fontWeight: '700', color: palette.ink, letterSpacing: 1,
  },
  error: { color: palette.danger, marginTop: spacing.sm, textAlign: 'center', fontSize: 12.5, fontWeight: '700' },
  legal: { marginTop: spacing.lg, ...typo.micro, color: palette.inkFaint, textAlign: 'center', maxWidth: 420 },

  primaryShell: { marginTop: spacing.lg, borderRadius: radius.md, overflow: 'hidden', minWidth: 220, ...elevation.card },
  primary: { minHeight: 52, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: palette.white, fontWeight: '900', fontSize: 14.5, letterSpacing: 0.3 },
  disabled: { opacity: 0.4 },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  avatarRing: { position: 'relative' },
  avatar: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: palette.azure, borderWidth: 2, borderColor: palette.white, alignItems: 'center', justifyContent: 'center', ...elevation.hairline },
  avatarText: { color: palette.white, fontSize: 22, fontWeight: '900' },
  heroBadge: { position: 'absolute', right: -3, bottom: -3 },
  name: { ...typo.heading, marginTop: 0 },
  status: { ...typo.meta, marginTop: 1 },
  headerGear: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: palette.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  headerAction: { fontSize: 17, color: palette.inkSoft },

  nowPlayingPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, alignSelf: 'flex-start', backgroundColor: palette.musicSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4, maxWidth: '100%' },
  nowPlayingIcon: { color: palette.music, fontSize: 12, fontWeight: '900' },
  nowPlayingText: { color: palette.music, fontSize: 11, fontWeight: '800', flexShrink: 1 },

  tabs: {
    flexDirection: 'row', paddingTop: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.xs,
    backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabPill: { width: 44, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabPillActive: { backgroundColor: palette.azureSoft },
  tabIcon: { fontSize: 16, opacity: 0.55 },
  tabIconActive: { opacity: 1 },
  tabLabel: { color: palette.inkFaint, fontSize: 9, fontWeight: '700' },
  tabActive: { color: palette.azureDeep, fontWeight: '900' },

  meNowPlaying: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, backgroundColor: palette.musicSoft, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, maxWidth: '100%' },
  meNowPlayingText: { color: palette.music, fontWeight: '800', fontSize: 12, flexShrink: 1 },

  profilePage: { alignItems: 'center', padding: spacing.xl, paddingBottom: spacing.xxxl, maxWidth: layout.maxContent, alignSelf: 'center', width: '100%' },
  profileAvatar: { width: 104, height: 104, borderRadius: radius.xxl, backgroundColor: palette.azure, borderWidth: 3, borderColor: palette.white, alignItems: 'center', justifyContent: 'center', ...elevation.card },
  profileAvatarText: { color: palette.white, fontSize: 42, fontWeight: '900' },
  profileName: { marginTop: spacing.md, ...typo.title, textAlign: 'center' },
  profileHandle: { ...typo.meta, color: palette.inkFaint, marginTop: 2 },
  profilePresence: { color: palette.success, marginTop: spacing.sm, fontWeight: '800', fontSize: 13 },
  profileBio: { ...typo.body, color: palette.inkSoft, marginTop: spacing.md, textAlign: 'center', maxWidth: 360 },
  profileGrid: { width: '100%', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  profileButton: { flex: 1, alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, paddingVertical: spacing.md, ...elevation.hairline },
  profileButtonIcon: { fontSize: 19 },
  profileButtonLabel: { color: palette.inkSoft, fontSize: 10, fontWeight: '800', marginTop: 4 },
  profileFoot: { ...typo.micro, color: palette.inkFaint, marginTop: spacing.xl },
  signOutButton: { marginTop: spacing.xl, minWidth: 190, alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairlineStrong, borderRadius: radius.md },
  signOutText: { color: palette.inkSoft, fontWeight: '900' },
});
