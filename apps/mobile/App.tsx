import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FeedScreen } from './src/features/feed/FeedScreen';
import { MomentsScreen } from './src/features/moments/MomentsScreen';
import { MsnContactsScreen, Contact } from './src/features/contacts/MsnContactsScreen';
import { ChatsHubScreen } from './src/features/chats/ChatsHubScreen';

type TabName = 'contacts' | 'chats' | 'feed' | 'map' | 'moments' | 'me';

export default function App() {
  const [tab, setTab] = useState<TabName>('contacts');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>(['Salut 👋', 'Bienvenue sur K-ssenger.']);
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

  const sendLocalDemoMessage = () => {
    const value = message.trim();
    if (!value) return;
    setMessages((current) => [...current, value]);
    setMessage('');
  };

  if (userAge === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.ageGate}>
          <View style={styles.logoOrb}><Text style={styles.logoText}>K</Text></View>
          <Text style={styles.brand}>K-SSENGER</Text>
          <Text style={styles.ageTitle}>Bienvenue dans MSN… version 2027.</Text>
          <Text style={styles.ageCopy}>Ton âge sert à protéger le K-Feed et les Moments publics. Les contenus 16+ et 18+ sont filtrés automatiquement.</Text>
          <TextInput value={ageInput} onChangeText={setAgeInput} keyboardType="number-pad" placeholder="Ton âge" maxLength={3} style={styles.ageInput} onSubmitEditing={confirmAge} />
          {!!ageError && <Text style={styles.error}>{ageError}</Text>}
          <TouchableOpacity style={styles.primary} onPress={confirmAge}><Text style={styles.primaryText}>Entrer dans K-ssenger</Text></TouchableOpacity>
          <Text style={styles.legal}>Version test · âge déclaré, vérification renforcée prévue.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selected) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setSelected(null)} accessibilityRole="button"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View style={styles.chatAvatar}><Text style={styles.chatAvatarText}>{selected.displayName[0]}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.chatName}>🟢 {selected.nickname}</Text>
            <Text style={styles.chatSub}>{selected.statusMessage ?? 'Disponible'}</Text>
            {!!selected.nowPlaying && <Text style={styles.chatMusic}>🎵 {selected.nowPlaying}</Text>}
          </View>
          <Text style={styles.headerAction}>📞</Text><Text style={styles.headerAction}>📍</Text>
        </View>
        <View style={styles.securityStrip}><Text style={styles.securityText}>🛡️ Prototype local · E2EE réel non encore activé</Text></View>
        <ScrollView style={styles.chatBody} contentContainerStyle={styles.chatContent}>
          {messages.map((item, index) => <View key={`${index}-${item}`} style={[styles.bubble, index % 2 ? styles.mine : styles.theirs]}><Text style={styles.bubbleText}>{item}</Text></View>)}
        </ScrollView>
        <View style={styles.composer}>
          <TouchableOpacity><Text style={styles.plus}>＋</Text></TouchableOpacity>
          <TextInput value={message} onChangeText={setMessage} placeholder="Écris un message..." style={styles.input} onSubmitEditing={sendLocalDemoMessage} returnKeyType="send" />
          <TouchableOpacity onPress={sendLocalDemoMessage}><Text style={styles.send}>➤</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMessages((current) => [...current, '⚡ WIZZ !'])}><View style={styles.wizzBtn}><Text style={styles.wizz}>⚡</Text></View></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
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
  return <View style={styles.hero}><View style={styles.avatarRing}><View style={styles.avatar}><Text style={styles.avatarText}>K</Text></View><View style={styles.onlineDot} /></View><View style={styles.flex}><Text style={styles.brand}>K-SSENGER</Text><Text style={styles.name}>KAH 😎 <Text style={styles.handle}>@kah</Text></Text><Text style={styles.status}>🟢 Disponible · « On est là. »</Text><View style={styles.musicPill}><Text style={styles.musicText}>🎵 Changes — 2Pac</Text></View></View><TouchableOpacity><Text style={styles.headerAction}>⚙️</Text></TouchableOpacity></View>;
}

function MapPreview() {
  return <View style={styles.center}><Text style={styles.bigIcon}>📍</Text><Text style={styles.centerTitle}>K-MAP</Text><Text style={styles.centerText}>Tes amis apparaissent uniquement lorsqu’ils choisissent de partager leur position.</Text><View style={styles.mapButtons}><TouchableOpacity style={styles.secondary}><Text style={styles.secondaryText}>👻 Ghost Mode</Text></TouchableOpacity><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🤝 On se capte ?</Text></TouchableOpacity></View></View>;
}

function MeScreen({ userAge }: { userAge: number }) {
  return <ScrollView contentContainerStyle={styles.profilePage}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>K</Text></View><Text style={styles.profileName}>KAH 😎</Text><Text style={styles.profileHandle}>@kah</Text><Text style={styles.profilePresence}>🟢 Disponible</Text><Text style={styles.profileQuote}>« Work hard, disappear, come back different. »</Text><View style={styles.profileMusic}><Text style={styles.profileMusicTitle}>🎵 EN ÉCOUTE</Text><Text style={styles.profileMusicSong}>Changes — 2Pac</Text></View><View style={styles.profileGrid}><ProfileButton icon="✏️" label="Pseudo"/><ProfileButton icon="🎵" label="Musique"/><ProfileButton icon="👥" label="Groupes"/><ProfileButton icon="🔒" label="Sécurité"/></View><Text style={styles.profileFoot}>Âge déclaré : {userAge} ans · contrôle de confidentialité actif</Text></ScrollView>;
}

function ProfileButton({ icon, label }: { icon: string; label: string }) { return <TouchableOpacity style={styles.profileButton}><Text style={styles.profileButtonIcon}>{icon}</Text><Text style={styles.profileButtonLabel}>{label}</Text></TouchableOpacity>; }
function Tab({ active, icon, label, onPress }: { active: boolean; icon: string; label: string; onPress: () => void }) { return <TouchableOpacity style={styles.tab} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}><Text style={styles.tabIcon}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></TouchableOpacity>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, flex: { flex: 1 },
  ageGate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }, logoOrb: { width: 82, height: 82, borderRadius: 28, backgroundColor: '#278dcc', borderWidth: 5, borderColor: '#bfe8ff', alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontSize: 37, fontWeight: '900' }, brand: { color: '#3784b5', fontSize: 10, letterSpacing: 2.2, fontWeight: '900' }, ageTitle: { marginTop: 22, fontSize: 27, lineHeight: 33, textAlign: 'center', color: '#15364a', fontWeight: '900' }, ageCopy: { marginTop: 10, maxWidth: 430, textAlign: 'center', color: '#648292', lineHeight: 20 }, ageInput: { width: 160, marginTop: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cee2ed', borderRadius: 17, padding: 13, textAlign: 'center', fontSize: 19 }, error: { color: '#b42318', marginTop: 9, textAlign: 'center' }, legal: { marginTop: 14, color: '#8197a4', fontSize: 10 },
  primary: { backgroundColor: '#2189c5', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 12, marginTop: 14 }, primaryText: { color: '#fff', fontWeight: '900' }, secondary: { borderWidth: 1, borderColor: '#a8d5ed', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, marginTop: 14 }, secondaryText: { color: '#347da8', fontWeight: '900' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, avatarRing: { position: 'relative' }, avatar: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#2f93cf', borderWidth: 4, borderColor: '#c5ecff', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontSize: 25, fontWeight: '900' }, onlineDot: { position: 'absolute', width: 15, height: 15, borderRadius: 8, backgroundColor: '#4ac769', right: -2, bottom: -2, borderWidth: 3, borderColor: '#fff' }, name: { color: '#16394e', fontSize: 18, fontWeight: '900', marginTop: 2 }, handle: { color: '#7b97a7', fontSize: 11, fontWeight: '600' }, status: { color: '#5d7c8e', fontSize: 11, marginTop: 2 }, musicPill: { alignSelf: 'flex-start', marginTop: 5, backgroundColor: '#e5f5ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9 }, musicText: { color: '#2f83b5', fontSize: 10, fontStyle: 'italic' }, headerAction: { fontSize: 20, marginLeft: 5 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, back: { fontSize: 39, lineHeight: 40, color: '#2189c5' }, chatAvatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#dff2ff', alignItems: 'center', justifyContent: 'center' }, chatAvatarText: { color: '#2a79a8', fontSize: 18, fontWeight: '900' }, chatName: { color: '#173448', fontSize: 15, fontWeight: '900' }, chatSub: { color: '#6e8796', fontSize: 10, marginTop: 2 }, chatMusic: { color: '#3387b8', fontSize: 10, marginTop: 2, fontStyle: 'italic' }, securityStrip: { alignItems: 'center', backgroundColor: '#eaf3f7', paddingVertical: 6 }, securityText: { color: '#6a8290', fontSize: 9 }, chatBody: { flex: 1, padding: 13 }, chatContent: { paddingVertical: 8 }, bubble: { maxWidth: '80%', padding: 11, borderRadius: 17, marginBottom: 8 }, mine: { alignSelf: 'flex-end', backgroundColor: '#cdeeff', borderBottomRightRadius: 5 }, theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 5 }, bubbleText: { color: '#173448' }, composer: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d7e9f3' }, plus: { color: '#2189c5', fontSize: 27 }, input: { flex: 1, backgroundColor: '#edf5f9', borderRadius: 19, paddingHorizontal: 14, paddingVertical: 9 }, send: { color: '#2189c5', fontSize: 22 }, wizzBtn: { width: 39, height: 39, borderRadius: 14, backgroundColor: '#fff2bd', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#efcf65' }, wizz: { fontSize: 22 },
  tabs: { flexDirection: 'row', paddingTop: 7, paddingBottom: 9, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d7e9f3' }, tab: { flex: 1, alignItems: 'center' }, tabIcon: { fontSize: 18 }, tabLabel: { marginTop: 2, color: '#8299a7', fontSize: 8 }, tabActive: { color: '#238ac8', fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, bigIcon: { fontSize: 62 }, centerTitle: { color: '#173448', fontWeight: '900', fontSize: 27, marginTop: 10 }, centerText: { color: '#688493', textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 400 }, mapButtons: { flexDirection: 'row', gap: 8 },
  profilePage: { alignItems: 'center', padding: 24, paddingBottom: 40 }, profileAvatar: { width: 100, height: 100, borderRadius: 34, backgroundColor: '#2f93cf', borderWidth: 5, borderColor: '#c5ecff', alignItems: 'center', justifyContent: 'center' }, profileAvatarText: { color: '#fff', fontSize: 40, fontWeight: '900' }, profileName: { marginTop: 14, color: '#173448', fontSize: 24, fontWeight: '900' }, profileHandle: { color: '#7d96a4', marginTop: 2 }, profilePresence: { color: '#4d7b61', marginTop: 8, fontWeight: '800' }, profileQuote: { maxWidth: 330, textAlign: 'center', color: '#657e8d', marginTop: 14, fontStyle: 'italic', lineHeight: 20 }, profileMusic: { width: '100%', marginTop: 18, backgroundColor: '#e5f5ff', borderRadius: 18, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#bee2f5' }, profileMusicTitle: { color: '#4a87aa', fontSize: 10, letterSpacing: 1.3, fontWeight: '900' }, profileMusicSong: { color: '#173448', fontWeight: '900', marginTop: 4 }, profileGrid: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 12 }, profileButton: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 15, paddingVertical: 12 }, profileButtonIcon: { fontSize: 20 }, profileButtonLabel: { color: '#52768a', fontSize: 10, fontWeight: '800', marginTop: 4 }, profileFoot: { color: '#8ba0ac', fontSize: 10, marginTop: 18 },
});