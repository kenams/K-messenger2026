import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import type { MyProfile } from './src/features/profile/useMyProfile';
import { getBackend } from './src/lib/backend';
import { disconnectRealtimeSocket } from './src/lib/realtime';

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

export default function App({ profile, onProfileChanged }: AppProps) {
  const [tab, setTab] = useState<TabName>('contacts');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [accountData, setAccountData] = useState(false);
  const [privacySettings, setPrivacySettings] = useState(false);
  const [groupsScreen, setGroupsScreen] = useState(false);
  const [userAge, setUserAge] = useState<number | null>(null);
  const [ageLoading, setAgeLoading] = useState(true);
  const [ageSaving, setAgeSaving] = useState(false);
  const [birthDateInput, setBirthDateInput] = useState('');
  const [ageError, setAgeError] = useState('');

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
        <View style={styles.ageGate}><ActivityIndicator /><Text style={styles.legal}>Vérification du profil de sécurité…</Text></View>
      </SafeAreaView>
    );
  }

  if (userAge === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.ageGate}>
          <Avatar profile={profile} size="large" />
          <Text style={styles.brand}>K-SSENGER</Text>
          <Text style={styles.ageTitle}>Bienvenue {profile.display_name}.</Text>
          <Text style={styles.ageCopy}>Ta date de naissance sert au filtrage serveur du K-Feed. Elle reste protégée par les règles RLS de ton compte.</Text>
          <TextInput
            value={birthDateInput}
            onChangeText={setBirthDateInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            placeholder="AAAA-MM-JJ"
            maxLength={10}
            style={styles.ageInput}
            onSubmitEditing={() => void confirmAge()}
          />
          {!!ageError && <Text style={styles.error}>{ageError}</Text>}
          <TouchableOpacity disabled={ageSaving} style={[styles.primary, ageSaving && styles.disabled]} onPress={() => void confirmAge()}>
            {ageSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Entrer dans K-ssenger</Text>}
          </TouchableOpacity>
          <Text style={styles.legal}>Âge déclaré · K-ssenger refuse l’accès au contenu public tant que ce profil n’est pas enregistré côté Neon.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selected) return <DirectConversationScreen contact={selected} onBack={() => setSelected(null)} />;
  if (editingProfile) return <ProfileEditScreen profile={profile} onSaved={onProfileChanged} onBack={() => setEditingProfile(false)} />;
  if (accountData) return <AccountDataScreen profile={profile} onBack={() => setAccountData(false)} />;
  if (privacySettings) return <PrivacySettingsScreen userId={profile.id} onBack={() => setPrivacySettings(false)} />;
  if (groupsScreen) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <TouchableOpacity style={styles.screenBack} onPress={() => setGroupsScreen(false)} accessibilityRole="button" accessibilityLabel="Retour au profil">
          <Text style={styles.screenBackText}>‹ Retour au profil</Text>
        </TouchableOpacity>
        <GroupsScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {tab !== 'feed' && tab !== 'moments' && tab !== 'map' && <ProfileHeader profile={profile} onEdit={() => setEditingProfile(true)} />}
      {tab === 'contacts' && <MsnContactsScreen onOpen={setSelected} />}
      {tab === 'chats' && <ChatsHubScreen />}
      {tab === 'feed' && <FeedScreen userAge={userAge} />}
      {tab === 'map' && <KMapScreen />}
      {tab === 'moments' && <MomentsScreen />}
      {tab === 'me' && <MeScreen profile={profile} userAge={userAge} onEdit={() => setEditingProfile(true)} onAccountData={() => setAccountData(true)} onPrivacy={() => setPrivacySettings(true)} onGroups={() => setGroupsScreen(true)} />}
      <View style={styles.tabs}>
        <Tab active={tab === 'contacts'} icon="👥" label="Contacts" onPress={() => setTab('contacts')} />
        <Tab active={tab === 'chats'} icon="💬" label="Chats" onPress={() => setTab('chats')} />
        <Tab active={tab === 'feed'} icon="▶️" label="K-Feed" onPress={() => setTab('feed')} />
        <Tab active={tab === 'map'} icon="📍" label="K-Map" onPress={() => setTab('map')} />
        <Tab active={tab === 'moments'} icon="✨" label="Moments" onPress={() => setTab('moments')} />
        <Tab active={tab === 'me'} icon="🙂" label="Moi" onPress={() => setTab('me')} />
      </View>
    </SafeAreaView>
  );
}

function Avatar({ profile, size = 'small' }: { profile: MyProfile; size?: 'small' | 'large' }) {
  const style = size === 'large' ? styles.profileAvatar : styles.avatar;
  const textStyle = size === 'large' ? styles.profileAvatarText : styles.avatarText;
  if (profile.avatar_url) return <Image source={{ uri: profile.avatar_url }} style={style} />;
  return <View style={style}><Text style={textStyle}>{profile.display_name[0]?.toUpperCase() ?? 'K'}</Text></View>;
}

function ProfileHeader({ profile, onEdit }: { profile: MyProfile; onEdit: () => void }) {
  const presenceIcon = profile.presence === 'online' ? '🟢' : profile.presence === 'busy' ? '🔴' : profile.presence === 'away' ? '🟠' : '⚫';
  return (
    <View style={styles.hero}>
      <View style={styles.avatarRing}><Avatar profile={profile} /><View style={styles.onlineDot} /></View>
      <View style={styles.flex}><Text style={styles.brand}>K-SSENGER</Text><Text style={styles.name}>{profile.display_name}</Text><Text style={styles.status}>{presenceIcon} {profile.custom_status || `@${profile.username}`}</Text></View>
      <TouchableOpacity onPress={onEdit} accessibilityLabel="Modifier mon profil"><Text style={styles.headerAction}>⚙️</Text></TouchableOpacity>
    </View>
  );
}

function MeScreen({ profile, userAge, onEdit, onAccountData, onPrivacy, onGroups }: { profile: MyProfile; userAge: number; onEdit: () => void; onAccountData: () => void; onPrivacy: () => void; onGroups: () => void }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      const { error } = await getBackend().auth.signOut();
      if (error) throw error;
      disconnectRealtimeSocket();
    } catch {
      setSignOutError('Déconnexion impossible pour le moment. Réessaie.');
      setSigningOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.profilePage}>
      <Avatar profile={profile} size="large" />
      <Text style={styles.profileName}>{profile.display_name}</Text><Text style={styles.profileHandle}>@{profile.username}</Text>
      <Text style={styles.profilePresence}>{profile.custom_status || 'Disponible'}</Text>
      {!!profile.now_playing_title && <Text style={styles.profileMusic}>♫ {profile.now_playing_artist ? `${profile.now_playing_artist} — ` : ''}{profile.now_playing_title}</Text>}
      {!!profile.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}
      <View style={styles.profileGrid}><ProfileButton icon="✏️" label="Profil" onPress={onEdit}/><ProfileButton icon="📦" label="Données" onPress={onAccountData}/><ProfileButton icon="👥" label="Groupes" onPress={onGroups}/><ProfileButton icon="🔒" label="Vie privée" onPress={onPrivacy}/></View>
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
  return <TouchableOpacity style={styles.tab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}><Text style={styles.tabIcon}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, flex: { flex: 1 },
  ageGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }, brand: { color: '#3784b5', fontSize: 10, letterSpacing: 2.2, fontWeight: '900' }, ageTitle: { marginTop: 22, fontSize: 27, lineHeight: 33, textAlign: 'center', color: '#15364a', fontWeight: '900' }, ageCopy: { marginTop: 10, maxWidth: 430, textAlign: 'center', color: '#648292', lineHeight: 20 }, ageInput: { width: 180, marginTop: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cee2ed', borderRadius: 17, padding: 13, textAlign: 'center', fontSize: 17 }, error: { color: '#b42318', marginTop: 9, textAlign: 'center' }, legal: { marginTop: 14, color: '#8197a4', fontSize: 10, textAlign: 'center' },
  primary: { backgroundColor: '#2189c5', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 12, marginTop: 14, minWidth: 190, alignItems: 'center' }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: 0.55 },
  screenBack: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, screenBackText: { color: '#2189c5', fontWeight: '900' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, avatarRing: { position: 'relative' }, avatar: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#2f93cf', borderWidth: 4, borderColor: '#c5ecff', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontSize: 25, fontWeight: '900' }, onlineDot: { position: 'absolute', width: 15, height: 15, borderRadius: 8, backgroundColor: '#4ac769', right: -2, bottom: -2, borderWidth: 3, borderColor: '#fff' }, name: { color: '#16394e', fontSize: 18, fontWeight: '900', marginTop: 2 }, status: { color: '#5d7c8e', fontSize: 11, marginTop: 2 }, headerAction: { fontSize: 20, marginLeft: 5 },
  tabs: { flexDirection: 'row', paddingTop: 7, paddingBottom: 9, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d7e9f3' }, tab: { flex: 1, alignItems: 'center' }, tabIcon: { fontSize: 18 }, tabLabel: { marginTop: 2, color: '#8299a7', fontSize: 8 }, tabActive: { color: '#238ac8', fontWeight: '900' },
  profilePage: { alignItems: 'center', padding: 24, paddingBottom: 40 }, profileAvatar: { width: 100, height: 100, borderRadius: 34, backgroundColor: '#2f93cf', borderWidth: 5, borderColor: '#c5ecff', alignItems: 'center', justifyContent: 'center' }, profileAvatarText: { color: '#fff', fontSize: 40, fontWeight: '900' }, profileName: { marginTop: 14, color: '#173448', fontSize: 24, fontWeight: '900', textAlign: 'center' }, profileHandle: { color: '#7d96a4', marginTop: 2 }, profilePresence: { color: '#4d7b61', marginTop: 8, fontWeight: '800' }, profileMusic: { color: '#4e7d55', marginTop: 5, fontSize: 12, fontStyle: 'italic', textAlign: 'center' }, profileBio: { color: '#657e8d', marginTop: 10, textAlign: 'center', lineHeight: 19, maxWidth: 360 }, profileGrid: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 18 }, profileButton: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 15, paddingVertical: 12 }, profileButtonIcon: { fontSize: 20 }, profileButtonLabel: { color: '#52768a', fontSize: 10, fontWeight: '800', marginTop: 4 }, profileFoot: { color: '#8ba0ac', fontSize: 10, marginTop: 18 },
  signOutButton: { marginTop: 18, minWidth: 180, alignItems: 'center', paddingHorizontal: 18, paddingVertical: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d7e4eb', borderRadius: 14 }, signOutText: { color: '#4c6879', fontWeight: '900' },
});