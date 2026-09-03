import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FeedScreen } from './src/features/feed/FeedScreen';
import { MomentsScreen } from './src/features/moments/MomentsScreen';
import { MsnContactsScreen, type Contact } from './src/features/contacts/MsnContactsScreen';
import { ChatsHubScreen } from './src/features/chats/ChatsHubScreen';
import { DirectConversationScreen } from './src/features/chats/DirectConversationScreen';

type TabName = 'contacts' | 'chats' | 'feed' | 'map' | 'moments' | 'me';

export default function App() {
  const [tab, setTab] = useState<TabName>('contacts');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [userAge, setUserAge] = useState<number | null>(null);
  const [ageInput, setAgeInput] = useState('');
  const [ageError, setAgeError] = useState('');

  const confirmAge = () => {
    const parsed = Number(ageInput);
    if (!Number.isInteger(parsed) || parsed < 13 || parsed > 120) {
      setAgeError('K-ssenger est actuellement réservé aux utilisateurs de 13 ans et plus.');
      return;
    }
    setAgeError('');
    setUserAge(parsed);
  };

  if (userAge === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.ageGate}>
          <View style={styles.logoOrb}><Text style={styles.logoText}>K</Text></View>
          <Text style={styles.brand}>K-SSENGER</Text>
          <Text style={styles.ageTitle}>Bienvenue dans K-ssenger.</Text>
          <Text style={styles.ageCopy}>Ton âge sert à protéger le K-Feed et les Moments publics. Les contenus 16+ et 18+ sont filtrés automatiquement.</Text>
          <TextInput value={ageInput} onChangeText={setAgeInput} keyboardType="number-pad" placeholder="Ton âge" maxLength={3} style={styles.ageInput} onSubmitEditing={confirmAge} />
          {!!ageError && <Text style={styles.error}>{ageError}</Text>}
          <TouchableOpacity style={styles.primary} onPress={confirmAge}><Text style={styles.primaryText}>Entrer dans K-ssenger</Text></TouchableOpacity>
          <Text style={styles.legal}>Âge déclaré · la vérification renforcée sera activée pour les fonctions sensibles.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selected) {
    return <DirectConversationScreen contact={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {tab !== 'feed' && tab !== 'moments' && <ProfileHeader />}
      {tab === 'contacts' && <MsnContactsScreen onOpen={setSelected} />}
      {tab === 'chats' && <ChatsHubScreen />}
      {tab === 'feed' && <FeedScreen userAge={userAge} />}
      {tab === 'map' && <MapPreview />}
      {tab === 'moments' && <MomentsScreen />}
      {tab === 'me' && <MeScreen userAge={userAge} />}
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

function ProfileHeader() {
  return (
    <View style={styles.hero}>
      <View style={styles.avatarRing}><View style={styles.avatar}><Text style={styles.avatarText}>K</Text></View><View style={styles.onlineDot} /></View>
      <View style={styles.flex}><Text style={styles.brand}>K-SSENGER</Text><Text style={styles.name}>Mon profil</Text><Text style={styles.status}>🟢 Disponible</Text></View>
      <TouchableOpacity><Text style={styles.headerAction}>⚙️</Text></TouchableOpacity>
    </View>
  );
}

function MapPreview() {
  return (
    <View style={styles.center}>
      <Text style={styles.bigIcon}>📍</Text><Text style={styles.centerTitle}>K-MAP</Text>
      <Text style={styles.centerText}>Tes contacts apparaissent uniquement lorsqu’ils choisissent explicitement de partager leur position. Le mode approximatif est réduit côté serveur avant lecture.</Text>
      <View style={styles.mapButtons}><TouchableOpacity style={styles.secondary}><Text style={styles.secondaryText}>👻 Ghost Mode</Text></TouchableOpacity><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🤝 On se capte ?</Text></TouchableOpacity></View>
    </View>
  );
}

function MeScreen({ userAge }: { userAge: number }) {
  return (
    <ScrollView contentContainerStyle={styles.profilePage}>
      <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>K</Text></View>
      <Text style={styles.profileName}>Mon identité K-ssenger</Text><Text style={styles.profilePresence}>🟢 Disponible</Text>
      <View style={styles.profileGrid}><ProfileButton icon="✏️" label="Pseudo"/><ProfileButton icon="🎵" label="Musique"/><ProfileButton icon="👥" label="Groupes"/><ProfileButton icon="🔒" label="Sécurité"/></View>
      <Text style={styles.profileFoot}>Âge déclaré : {userAge} ans · contrôle de confidentialité actif</Text>
    </ScrollView>
  );
}

function ProfileButton({ icon, label }: { icon: string; label: string }) {
  return <TouchableOpacity style={styles.profileButton}><Text style={styles.profileButtonIcon}>{icon}</Text><Text style={styles.profileButtonLabel}>{label}</Text></TouchableOpacity>;
}

function Tab({ active, icon, label, onPress }: { active: boolean; icon: string; label: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.tab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}><Text style={styles.tabIcon}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, flex: { flex: 1 },
  ageGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }, logoOrb: { width: 82, height: 82, borderRadius: 28, backgroundColor: '#278dcc', borderWidth: 5, borderColor: '#bfe8ff', alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontSize: 37, fontWeight: '900' }, brand: { color: '#3784b5', fontSize: 10, letterSpacing: 2.2, fontWeight: '900' }, ageTitle: { marginTop: 22, fontSize: 27, lineHeight: 33, textAlign: 'center', color: '#15364a', fontWeight: '900' }, ageCopy: { marginTop: 10, maxWidth: 430, textAlign: 'center', color: '#648292', lineHeight: 20 }, ageInput: { width: 160, marginTop: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cee2ed', borderRadius: 17, padding: 13, textAlign: 'center', fontSize: 19 }, error: { color: '#b42318', marginTop: 9, textAlign: 'center' }, legal: { marginTop: 14, color: '#8197a4', fontSize: 10, textAlign: 'center' },
  primary: { backgroundColor: '#2189c5', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 12, marginTop: 14 }, primaryText: { color: '#fff', fontWeight: '900' }, secondary: { borderWidth: 1, borderColor: '#a8d5ed', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, marginTop: 14 }, secondaryText: { color: '#347da8', fontWeight: '900' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, avatarRing: { position: 'relative' }, avatar: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#2f93cf', borderWidth: 4, borderColor: '#c5ecff', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontSize: 25, fontWeight: '900' }, onlineDot: { position: 'absolute', width: 15, height: 15, borderRadius: 8, backgroundColor: '#4ac769', right: -2, bottom: -2, borderWidth: 3, borderColor: '#fff' }, name: { color: '#16394e', fontSize: 18, fontWeight: '900', marginTop: 2 }, status: { color: '#5d7c8e', fontSize: 11, marginTop: 2 }, headerAction: { fontSize: 20, marginLeft: 5 },
  tabs: { flexDirection: 'row', paddingTop: 7, paddingBottom: 9, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d7e9f3' }, tab: { flex: 1, alignItems: 'center' }, tabIcon: { fontSize: 18 }, tabLabel: { marginTop: 2, color: '#8299a7', fontSize: 8 }, tabActive: { color: '#238ac8', fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, bigIcon: { fontSize: 62 }, centerTitle: { color: '#173448', fontWeight: '900', fontSize: 27, marginTop: 10 }, centerText: { color: '#688493', textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 400 }, mapButtons: { flexDirection: 'row', gap: 8 },
  profilePage: { alignItems: 'center', padding: 24, paddingBottom: 40 }, profileAvatar: { width: 100, height: 100, borderRadius: 34, backgroundColor: '#2f93cf', borderWidth: 5, borderColor: '#c5ecff', alignItems: 'center', justifyContent: 'center' }, profileAvatarText: { color: '#fff', fontSize: 40, fontWeight: '900' }, profileName: { marginTop: 14, color: '#173448', fontSize: 24, fontWeight: '900', textAlign: 'center' }, profilePresence: { color: '#4d7b61', marginTop: 8, fontWeight: '800' }, profileGrid: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 18 }, profileButton: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 15, paddingVertical: 12 }, profileButtonIcon: { fontSize: 20 }, profileButtonLabel: { color: '#52768a', fontSize: 10, fontWeight: '800', marginTop: 4 }, profileFoot: { color: '#8ba0ac', fontSize: 10, marginTop: 18 },
});
