import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { FeedScreen } from './src/features/feed/FeedScreen';
import { MomentsScreen } from './src/features/moments/MomentsScreen';
import { KMapScreen } from './src/features/map/KMapScreen';
import { MsnContactsScreen, type Contact } from './src/features/contacts/MsnContactsScreen';
import { ChatsHubScreen } from './src/features/chats/ChatsHubScreen';
import { DirectConversationScreen } from './src/features/chats/DirectConversationScreen';
import { GroupsScreen } from './src/features/groups/GroupsScreen';
import { LiveScreen } from './src/features/live/LiveScreen';
import { useLiveBroadcasts } from './src/features/live/useLiveBroadcasts';
import { useWebNotifications } from './src/features/notifications/useWebNotifications';
import { AccountDataScreen } from './src/features/profile/AccountDataScreen';
import { PrivacySettingsScreen } from './src/features/profile/PrivacySettingsScreen';
import { ProfileEditScreen } from './src/features/profile/ProfileEditScreen';
import type { MyProfile } from './src/features/profile/useMyProfile';
import { useNowPlayingSync } from './src/features/profile/useNowPlayingSync';
import { unregisterPushForSignOut } from './src/features/push/usePushRegistration';
import { getBackend, notifyAuthStateMayHaveChanged } from './src/lib/backend';
import { getMediaDownload } from './src/lib/media';
import { disconnectRealtimeSocket } from './src/lib/realtime';
import { LinearGradient } from 'expo-linear-gradient';
import { brandGradient, elevation, immersive, layout, radius, spacing, type Palette, type TypeTokens } from './src/theme/tokens';
import { Equalizer, NowPlayingSheet, PresenceBadge, ScreenHeader, SectionLabel, Segmented, useAndroidBack } from './src/theme/components';
import { useTheme, type ThemeMode } from './src/theme/ThemeProvider';
import { accentOf } from './src/theme/accent';
import { MobileAppQr } from './src/features/profile/MobileAppQr';

/** "K-ssenger V2 Beta · build 2" — never claims "Production"/"Stable Release".
 * Fully hardcoded, not read from Constants.expoConfig: on Expo web exports,
 * expo-constants ships its own internal default manifest (version "1.0.0") instead
 * of embedding app.json, so reading Constants there silently gives the wrong value.
 * Bump these two lines in lockstep with app.json on every release. */
const APP_VERSION = '2.0.0-beta.1';
const APP_BUILD = 2;
function appVersionLabel(): string {
  const isBeta = /beta/i.test(APP_VERSION);
  return `K-ssenger V2 ${isBeta ? 'Beta' : ''} · ${APP_VERSION} · build ${APP_BUILD}`.replace(/\s+/g, ' ').trim();
}

type TabName = 'contacts' | 'chats' | 'feed' | 'map' | 'moments' | 'me';

type AppProps = {
  profile: MyProfile;
  onProfileChanged: () => Promise<void>;
};

type AgeProfileRow = {
  birth_date?: string;
};

// Browser/OS autofill often hands back JJ/MM/AAAA (or JJ-MM-AAAA) instead of
// the AAAA-MM-JJ we ask for — normalize both to ISO instead of rejecting a
// value the user never actually typed wrong.
function normalizeBirthDate(rawValue: string): string {
  const value = rawValue.trim();
  const eu = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return eu ? `${eu[3]}-${eu[2]}-${eu[1]}` : value;
}

function ageFromBirthDate(rawValue: string): number | null {
  const value = normalizeBirthDate(rawValue);
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
  const { styles } = useAppStyles();
  const { scheme } = useTheme();
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.shell}>{children}</View>
    </SafeAreaView>
  );
}

/** Web-only: viewport wide enough to earn the full-screen desktop
 * (MSN-style) shell — fixed buddy-list rail + a conversation pane that
 * fills the rest of the window — instead of the phone-shaped mobile
 * column. Native (Android/iOS) never takes this branch. */
const DESKTOP_MIN_WIDTH = 900;
function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

export default function App({ profile, onProfileChanged }: AppProps) {
  const { styles, colors } = useAppStyles();
  const { scheme } = useTheme();
  const isDesktopWeb = useIsDesktopWeb();
  const [tab, setTab] = useState<TabName>('contacts');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabName>>(() => new Set(['contacts']));
  useEffect(() => {
    if (!visitedTabs.has(tab)) setVisitedTabs((prev) => new Set(prev).add(tab));
  }, [tab, visitedTabs]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [accountData, setAccountData] = useState(false);
  const [privacySettings, setPrivacySettings] = useState(false);
  const [groupsScreen, setGroupsScreen] = useState(false);
  const [liveScreen, setLiveScreen] = useState<{ broadcasterId: string | null } | null>(null);
  const liveBroadcasts = useLiveBroadcasts();
  useNowPlayingSync(profile, onProfileChanged);
  useWebNotifications(profile.id);
  const [userAge, setUserAge] = useState<number | null>(null);
  const [ageLoading, setAgeLoading] = useState(true);
  const [ageSaving, setAgeSaving] = useState(false);
  const [birthDateInput, setBirthDateInput] = useState('');
  const [ageError, setAgeError] = useState('');
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  // One place to dismiss whatever secondary screen sits above the tab shell.
  const overlayOpen =
    !!selected || editingProfile || accountData || privacySettings || groupsScreen || !!liveScreen;

  const closeOverlays = useCallback(() => {
    setSelected(null);
    setEditingProfile(false);
    setAccountData(false);
    setPrivacySettings(false);
    setGroupsScreen(false);
    setLiveScreen(null);
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
      const birthDate = normalizeBirthDate(birthDateInput);
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
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <View style={styles.ageGate}><ActivityIndicator size="large" color={colors.azure} /><Text style={styles.legal}>Vérification du profil de sécurité…</Text></View>
      </SafeAreaView>
    );
  }

  if (userAge === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
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
              placeholderTextColor={colors.inkFaint}
              maxLength={10}
              style={styles.ageInput}
              onSubmitEditing={() => void confirmAge()}
            />
            {!!ageError && <Text style={styles.error}>{ageError}</Text>}
            <TouchableOpacity disabled={ageSaving} activeOpacity={0.9} style={[styles.primaryShell, ageSaving && styles.disabled]} onPress={() => void confirmAge()}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary} pointerEvents="none">
                {ageSaving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Entrer dans K-ssenger</Text>}
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.legal}>Âge déclaré · l’accès au contenu public reste fermé tant que ce profil n’est pas enregistré côté Neon.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (isDesktopWeb) {
    return (
      <DesktopShell
        profile={profile}
        tab={tab}
        setTab={setTab}
        selected={selected}
        setSelected={setSelected}
        editingProfile={editingProfile}
        setEditingProfile={setEditingProfile}
        accountData={accountData}
        setAccountData={setAccountData}
        privacySettings={privacySettings}
        setPrivacySettings={setPrivacySettings}
        groupsScreen={groupsScreen}
        setGroupsScreen={setGroupsScreen}
        liveScreen={liveScreen}
        setLiveScreen={setLiveScreen}
        liveBroadcasts={liveBroadcasts}
        userAge={userAge}
        nowPlayingOpen={nowPlayingOpen}
        setNowPlayingOpen={setNowPlayingOpen}
        saveNowPlaying={saveNowPlaying}
        onProfileChanged={onProfileChanged}
      />
    );
  }

  if (liveScreen) {
    return <LiveScreen broadcasterId={liveScreen.broadcasterId} onClose={() => setLiveScreen(null)} />;
  }
  if (selected) {
    return (
      <WebShell>
        <DirectConversationScreen contact={selected} onBack={() => setSelected(null)} />
      </WebShell>
    );
  }
  if (editingProfile) return <WebShell><ProfileEditScreen profile={profile} onSaved={onProfileChanged} onBack={() => setEditingProfile(false)} /></WebShell>;
  if (accountData) return <WebShell><AccountDataScreen profile={profile} onBack={() => setAccountData(false)} /></WebShell>;
  if (privacySettings) return <WebShell><PrivacySettingsScreen userId={profile.id} onBack={() => setPrivacySettings(false)} /></WebShell>;
  if (groupsScreen) {
    return (
      <WebShell>
        <ScreenHeader title="Groupes" subtitle="Connexion sécurisée" onBack={() => setGroupsScreen(false)} />
        <GroupsScreen />
      </WebShell>
    );
  }

  const immersive = tab === 'feed';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.shell, immersive && styles.shellImmersive]}>
        {tab !== 'feed' && tab !== 'moments' && tab !== 'map' && <ProfileHeader profile={profile} onEdit={() => setEditingProfile(true)} onNowPlaying={() => setNowPlayingOpen(true)} />}
        {liveBroadcasts.size > 0 && tab !== 'feed' && Platform.OS === 'web' && (
          <TouchableOpacity
            style={styles.liveBanner}
            onPress={() => setLiveScreen({ broadcasterId: [...liveBroadcasts.keys()][0] })}
            accessibilityRole="button"
          >
            <Text style={styles.liveBannerText}>🔴 {[...liveBroadcasts.values()][0]} est en direct — rejoindre</Text>
          </TouchableOpacity>
        )}
        {/* Contacts/Chats/Moi stay mounted (hidden, not removed) once visited —
            re-entering them shouldn't redo their socket sync/data load from
            scratch every time, which was the main source of tab-switch lag.
            Feed/K-Map/Moments keep unmounting on tab-out: they hold a video
            feed / continuous GPS watch that shouldn't run in the background. */}
        {visitedTabs.has('contacts') && (
          <View style={tab === 'contacts' ? styles.flex : styles.hiddenPane}><MsnContactsScreen onOpen={setSelected} /></View>
        )}
        {visitedTabs.has('chats') && (
          <View style={tab === 'chats' ? styles.flex : styles.hiddenPane}><ChatsHubScreen /></View>
        )}
        {tab === 'feed' && <FeedScreen userAge={userAge} />}
        {tab === 'map' && <KMapScreen />}
        {tab === 'moments' && <MomentsScreen />}
        {visitedTabs.has('me') && (
          <View style={tab === 'me' ? styles.flex : styles.hiddenPane}>
          <MeScreen profile={profile} userAge={userAge} onEdit={() => setEditingProfile(true)} onAccountData={() => setAccountData(true)} onPrivacy={() => setPrivacySettings(true)} onGroups={() => setGroupsScreen(true)} onNowPlaying={() => setNowPlayingOpen(true)} onLive={() => {
          // K-Live's native video module (react-native-webrtc) is temporarily
          // pulled from Android/iOS builds — it broke unrelated networking
          // (profile/auth fetches) on real devices even though it never got
          // opened; the JS screen is still here for web, which doesn't need
          // that native module and isn't affected. Re-add the config plugins
          // in app.json once that conflict is root-caused and fixed.
          if (Platform.OS === 'web') setLiveScreen({ broadcasterId: null });
          else Alert.alert('K-Live', 'Le live vidéo arrive bientôt sur mobile. Disponible dès maintenant sur la version web.');
        }} />
          </View>
        )}
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

type DesktopShellProps = {
  profile: MyProfile;
  tab: TabName;
  setTab: (t: TabName) => void;
  selected: Contact | null;
  setSelected: (c: Contact | null) => void;
  editingProfile: boolean;
  setEditingProfile: (b: boolean) => void;
  accountData: boolean;
  setAccountData: (b: boolean) => void;
  privacySettings: boolean;
  setPrivacySettings: (b: boolean) => void;
  groupsScreen: boolean;
  setGroupsScreen: (b: boolean) => void;
  liveScreen: { broadcasterId: string | null } | null;
  setLiveScreen: (v: { broadcasterId: string | null } | null) => void;
  liveBroadcasts: Map<string, string>;
  userAge: number;
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (b: boolean) => void;
  saveNowPlaying: (title: string, artist: string) => Promise<void>;
  onProfileChanged: () => Promise<void>;
};

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 360;
const SIDEBAR_WIDTH_STORAGE_KEY = 'kssenger.desktop.sidebarWidth';

function loadStoredSidebarWidth(): number {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function persistSidebarWidth(width: number) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // storage unavailable (private mode, quota) — width just won't persist
  }
}

/** Drag handle between the buddy-list sidebar and the conversation pane.
 * Mouse-only (desktop web): mousedown on the handle starts tracking window
 * mousemove/mouseup so the drag keeps working even if the pointer leaves the
 * thin handle strip. Width is clamped to [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH]. */
function SidebarResizeHandle({ onResize, onResizeEnd }: { onResize: (deltaX: number) => void; onResizeEnd: () => void }) {
  const { styles } = useAppStyles();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    let lastX: number | null = null;
    const handleMove = (e: MouseEvent) => {
      if (lastX === null) { lastX = e.clientX; return; }
      const deltaX = e.clientX - lastX;
      lastX = e.clientX;
      onResize(deltaX);
    };
    const handleUp = () => { setActive(false); onResizeEnd(); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <View
      testID="desktop-sidebar-resize-handle"
      accessibilityRole="none"
      style={[styles.sidebarResizeHandle, active && styles.sidebarResizeHandleActive, Platform.OS === 'web' ? ({ cursor: 'col-resize' } as any) : null]}
      // @ts-expect-error web-only DOM mouse handler, harmless no-op on native
      onMouseDown={(e: any) => { e.preventDefault?.(); setActive(true); }}
    >
      <View style={[styles.sidebarResizeGrip, active && styles.sidebarResizeGripActive]} />
    </View>
  );
}

const DESKTOP_NAV_ITEMS: { tab: TabName; icon: string; label: string }[] = [
  { tab: 'contacts', icon: '👥', label: 'Contacts' },
  { tab: 'chats', icon: '💬', label: 'Chats' },
  { tab: 'feed', icon: '▶️', label: 'K-Feed' },
  { tab: 'map', icon: '📍', label: 'K-Map' },
  { tab: 'moments', icon: '✨', label: 'Moments' },
  { tab: 'me', icon: '🙂', label: 'Moi' },
];

/** Real full-screen "app" shell for wide web viewports — a fixed buddy-list
 * rail on the left and a conversation/content pane that fills every
 * remaining pixel of the browser window, MSN-Messenger-style. No page
 * scroll, no site margins: only the panes below scroll internally. Native
 * builds and narrow web never mount this — they keep the phone-shaped
 * single-column flow above untouched. */
function DesktopShell(props: DesktopShellProps) {
  const {
    profile, tab, setTab, selected, setSelected,
    editingProfile, setEditingProfile, accountData, setAccountData,
    privacySettings, setPrivacySettings, groupsScreen, setGroupsScreen,
    liveScreen, setLiveScreen, liveBroadcasts, userAge,
    nowPlayingOpen, setNowPlayingOpen, saveNowPlaying, onProfileChanged,
  } = props;
  const { styles, colors } = useAppStyles();
  const { scheme } = useTheme();
  const [sidebarWidth, setSidebarWidth] = useState(loadStoredSidebarWidth);
  const sidebarWidthRef = React.useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const handleSidebarResize = useCallback((deltaX: number) => {
    setSidebarWidth((prev) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, prev + deltaX)));
  }, []);
  const handleSidebarResizeEnd = useCallback(() => {
    persistSidebarWidth(sidebarWidthRef.current);
  }, []);

  const overlay: 'editProfile' | 'accountData' | 'privacy' | 'groups' | 'live' | null =
    liveScreen ? 'live'
    : editingProfile ? 'editProfile'
    : accountData ? 'accountData'
    : privacySettings ? 'privacy'
    : groupsScreen ? 'groups'
    : null;

  const closeOverlay = () => {
    setEditingProfile(false);
    setAccountData(false);
    setPrivacySettings(false);
    setGroupsScreen(false);
    setLiveScreen(null);
  };

  const showBuddyList = tab === 'contacts' && !overlay;

  let mainContent: React.ReactNode;
  if (overlay === 'live') {
    mainContent = <LiveScreen broadcasterId={liveScreen!.broadcasterId} onClose={closeOverlay} />;
  } else if (overlay === 'editProfile') {
    mainContent = <ProfileEditScreen profile={profile} onSaved={onProfileChanged} onBack={closeOverlay} />;
  } else if (overlay === 'accountData') {
    mainContent = <AccountDataScreen profile={profile} onBack={closeOverlay} />;
  } else if (overlay === 'privacy') {
    mainContent = <PrivacySettingsScreen userId={profile.id} onBack={closeOverlay} />;
  } else if (overlay === 'groups') {
    mainContent = (
      <>
        <ScreenHeader title="Groupes" subtitle="Connexion sécurisée" onBack={closeOverlay} />
        <GroupsScreen />
      </>
    );
  } else if (tab === 'contacts') {
    mainContent = selected
      ? <DirectConversationScreen key={selected.id} contact={selected} onBack={() => setSelected(null)} />
      : <EmptyConversationPane profile={profile} />;
  } else if (tab === 'chats') {
    mainContent = <ChatsHubScreen />;
  } else if (tab === 'feed') {
    mainContent = <FeedScreen userAge={userAge} />;
  } else if (tab === 'map') {
    mainContent = <KMapScreen />;
  } else if (tab === 'moments') {
    mainContent = <MomentsScreen />;
  } else {
    mainContent = (
      <MeScreen
        profile={profile}
        userAge={userAge}
        onEdit={() => setEditingProfile(true)}
        onAccountData={() => setAccountData(true)}
        onPrivacy={() => setPrivacySettings(true)}
        onGroups={() => setGroupsScreen(true)}
        onNowPlaying={() => setNowPlayingOpen(true)}
        onLive={() => setLiveScreen({ broadcasterId: null })}
      />
    );
  }

  return (
    <View style={styles.desktopRoot}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.desktopBody}>
        <View style={styles.navRail}>
          <View style={styles.navRailBrand}>
            <Avatar profile={profile} />
          </View>
          {DESKTOP_NAV_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.tab}
              testID={`desktop-tab-${item.label}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.tab && !overlay }}
              style={[styles.navRailItem, tab === item.tab && !overlay && styles.navRailItemActive]}
              onPress={() => { closeOverlay(); setTab(item.tab); }}
            >
              <Text style={styles.navRailIcon}>{item.icon}</Text>
              <Text style={[styles.navRailLabel, tab === item.tab && !overlay && styles.navRailLabelActive]}>{item.label}</Text>
              {item.tab === 'chats' && liveBroadcasts.size > 0 && <View style={styles.navRailDot} />}
            </TouchableOpacity>
          ))}
          <View style={styles.flex} />
          {liveBroadcasts.size > 0 && (
            <TouchableOpacity
              style={styles.navRailLive}
              onPress={() => setLiveScreen({ broadcasterId: [...liveBroadcasts.keys()][0] })}
              accessibilityRole="button"
            >
              <Text style={styles.navRailLiveText}>🔴 Live</Text>
            </TouchableOpacity>
          )}
        </View>
        {showBuddyList && (
          <>
            <View style={[styles.sidebarPane, { width: sidebarWidth }]}>
              <ProfileHeader profile={profile} onEdit={() => setEditingProfile(true)} onNowPlaying={() => setNowPlayingOpen(true)} />
              <MsnContactsScreen onOpen={setSelected} />
            </View>
            <SidebarResizeHandle onResize={handleSidebarResize} onResizeEnd={handleSidebarResizeEnd} />
          </>
        )}
        <View style={styles.mainPane}>{mainContent}</View>
      </View>
      <NowPlayingSheet
        visible={nowPlayingOpen}
        initialTitle={profile.now_playing_title ?? ''}
        initialArtist={profile.now_playing_artist ?? ''}
        onClose={() => setNowPlayingOpen(false)}
        onSubmit={saveNowPlaying}
      />
    </View>
  );
}

function EmptyConversationPane({ profile }: { profile: MyProfile }) {
  const { styles } = useAppStyles();
  return (
    <View style={styles.emptyConvo}>
      <Text style={styles.emptyConvoIcon}>💬</Text>
      <Text style={styles.emptyConvoTitle}>Choisis un contact</Text>
      <Text style={styles.emptyConvoCopy}>Sélectionne un ami dans ta liste pour ouvrir la conversation, {profile.display_name.split(' ')[0]}.</Text>
    </View>
  );
}

function Avatar({ profile, size = 'small' }: { profile: MyProfile; size?: 'small' | 'large' }) {
  const { styles } = useAppStyles();
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
  const { styles } = useAppStyles();
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

const APPEARANCE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Système' },
];

function MeScreen({ profile, userAge, onEdit, onAccountData, onPrivacy, onGroups, onNowPlaying, onLive }: { profile: MyProfile; userAge: number; onEdit: () => void; onAccountData: () => void; onPrivacy: () => void; onGroups: () => void; onNowPlaying: () => void; onLive: () => void }) {
  const { styles } = useAppStyles();
  const { mode, setMode } = useTheme();
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
      // The auth adapter doesn't always emit onAuthStateChange after signOut,
      // which left the app stuck on the spinner forever (setSigningOut(false)
      // was only ever called in the catch branch). Web reloads to force a
      // clean landing on the sign-in screen; native has no equivalent, so it
      // pokes useAuthSession to re-check the (now cleared) session directly.
      if (Platform.OS === 'web' && typeof window !== 'undefined') { window.location.reload(); return; }
      notifyAuthStateMayHaveChanged();
      setSigningOut(false);
    } catch {
      setSignOutError('Déconnexion sécurisée impossible pour le moment. Réessaie avec une connexion réseau afin de couper aussi les notifications de ce compte.');
      setSigningOut(false);
    }
  };

  const accent = accentOf(profile.accent_color);

  return (
    <ScrollView contentContainerStyle={styles.profilePage}>
      <View style={[styles.accentRing, { borderColor: accent }]}><Avatar profile={profile} size="large" /></View>
      <Text style={styles.profileName}>{profile.display_name}</Text><Text style={styles.profileHandle}>@{profile.username}</Text>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
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
      <View style={styles.profileGrid}><ProfileButton icon="✏️" label="Profil" onPress={onEdit}/><ProfileButton icon="📦" label="Données" onPress={onAccountData}/><ProfileButton icon="👥" label="Groupes" onPress={onGroups}/><ProfileButton icon="🔒" label="Vie privée" onPress={onPrivacy}/><ProfileButton icon="🔴" label="K-Live" onPress={onLive}/></View>
      <View style={styles.appearanceSection}>
        <SectionLabel>Apparence</SectionLabel>
        <Segmented value={mode} options={APPEARANCE_OPTIONS} onChange={setMode} />
      </View>
      <TouchableOpacity disabled={signingOut} style={[styles.signOutButton, signingOut && styles.disabled]} onPress={() => void signOut()} accessibilityRole="button" accessibilityLabel="Se déconnecter de K-ssenger">
        {signingOut ? <ActivityIndicator /> : <Text style={styles.signOutText}>Se déconnecter</Text>}
      </TouchableOpacity>
      {!!signOutError && <Text style={styles.error}>{signOutError}</Text>}
      {Platform.OS === 'web' && (
        <View style={styles.meQrPanel}>
          <MobileAppQr />
        </View>
      )}
      <Text style={styles.profileFoot}>Âge déclaré : {userAge} ans · contrôle de confidentialité actif</Text>
      <Text style={styles.profileFoot}>{appVersionLabel()}</Text>
      <Text style={styles.profileFoot}>Une application KAH Digital</Text>
    </ScrollView>
  );
}

function ProfileButton({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
  const { styles } = useAppStyles();
  return <TouchableOpacity testID={`me-${label}`} accessibilityRole="button" accessibilityLabel={label} style={styles.profileButton} onPress={onPress}><Text style={styles.profileButtonIcon}>{icon}</Text><Text style={styles.profileButtonLabel}>{label}</Text></TouchableOpacity>;
}

function Tab({ active, icon, label, onPress }: { active: boolean; icon: string; label: string; onPress: () => void }) {
  const { styles } = useAppStyles();
  return (
    <TouchableOpacity testID={`tab-${label}`} style={styles.tab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <View style={[styles.tabPill, active && styles.tabPillActive]}>
        <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</Text>
      </View>
      <Text style={[styles.tabLabel, active && styles.tabActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const SHELL_MAX = 720;

/** Every component in this file pulls its styles from here, memoized per active theme. */
function useAppStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surfaceSunken, alignItems: 'center' },
  shell: {
    flex: 1,
    width: '100%',
    maxWidth: SHELL_MAX,
    backgroundColor: palette.sky,
    ...(Platform.OS === 'web' ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: palette.hairline } : null),
  },
  shellImmersive: { maxWidth: SHELL_MAX, backgroundColor: immersive.surface },
  flex: { flex: 1 },
  hiddenPane: { display: 'none' },

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
  liveBanner: { backgroundColor: palette.danger, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  liveBannerText: { color: palette.white, fontWeight: '900', fontSize: 13 },
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
  accentRing: { borderWidth: 3, borderRadius: radius.pill, padding: 3 },
  accentBar: { width: 44, height: 4, borderRadius: radius.pill, marginTop: spacing.sm },
  profileName: { marginTop: spacing.md, ...typo.title, textAlign: 'center' },
  profileHandle: { ...typo.meta, color: palette.inkFaint, marginTop: 2 },
  profilePresence: { color: palette.success, marginTop: spacing.sm, fontWeight: '800', fontSize: 13 },
  profileBio: { ...typo.body, color: palette.inkSoft, marginTop: spacing.md, textAlign: 'center', maxWidth: 360 },
  profileGrid: { width: '100%', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  profileButton: { flex: 1, alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, paddingVertical: spacing.md, ...elevation.hairline },
  profileButtonIcon: { fontSize: 19 },
  profileButtonLabel: { color: palette.inkSoft, fontSize: 10, fontWeight: '800', marginTop: 4 },
  profileFoot: { ...typo.micro, color: palette.inkFaint, marginTop: spacing.xl },
  meQrPanel: { alignSelf: 'stretch', marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: palette.hairline },
  signOutButton: { marginTop: spacing.xl, minWidth: 190, alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairlineStrong, borderRadius: radius.md },
  signOutText: { color: palette.inkSoft, fontWeight: '900' },
  appearanceSection: { width: '100%', marginTop: spacing.xl },

  // Desktop web only ("full-screen MSN app" shell) — no max-width column,
  // no site margins: fills the entire browser viewport, only inner panes
  // scroll.
  desktopRoot: { flex: 1, ...(Platform.OS === 'web' ? ({ height: '100vh' } as unknown as { height: number }) : null), backgroundColor: palette.surfaceSunken },
  desktopBody: { flex: 1, flexDirection: 'row', width: '100%', overflow: 'hidden' },
  navRail: {
    width: 84, alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs,
    backgroundColor: palette.navy, borderRightWidth: 1, borderRightColor: palette.hairlineStrong,
  },
  navRailBrand: { marginBottom: spacing.md },
  navRailItem: { width: 64, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, gap: 2 },
  navRailItemActive: { backgroundColor: palette.navyGlow },
  navRailIcon: { fontSize: 20, opacity: 0.75 },
  navRailLabel: { color: palette.inkOnAzure, opacity: 0.55, fontSize: 9.5, fontWeight: '700' },
  navRailLabelActive: { opacity: 1 },
  navRailDot: { position: 'absolute', top: 6, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: palette.danger },
  navRailLive: { marginBottom: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: palette.danger },
  navRailLiveText: { color: palette.white, fontWeight: '900', fontSize: 10.5 },

  sidebarPane: {
    borderRightWidth: 1, borderRightColor: palette.hairline,
    backgroundColor: palette.sky,
  },
  mainPane: { flex: 1, backgroundColor: palette.surface },

  sidebarResizeHandle: {
    width: 6, marginHorizontal: -3, zIndex: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  sidebarResizeHandleActive: { backgroundColor: palette.azure + '22' },
  sidebarResizeGrip: { width: 3, height: 36, borderRadius: radius.pill, backgroundColor: palette.hairlineStrong },
  sidebarResizeGripActive: { backgroundColor: palette.azure, height: 56 },

  emptyConvo: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyConvoIcon: { fontSize: 44, marginBottom: spacing.md },
  emptyConvoTitle: { ...typo.title, color: palette.ink },
  emptyConvoCopy: { ...typo.body, color: palette.inkSoft, marginTop: spacing.sm, textAlign: 'center', maxWidth: 320 },
  });
}
